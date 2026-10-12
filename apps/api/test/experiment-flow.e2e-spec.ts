import { Test } from '@nestjs/testing';
import {
  comparisonSchema,
  experimentSchema,
  runDetailSchema,
  runSummarySchema,
  type AgentConfigInput,
  type Comparison,
  type Experiment,
  type SuiteInput,
} from '@higheval/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '../src/configure-app.js';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import {
  AgentExecutor,
  type ExecutionHooks,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../src/execution/agent-executor.js';
import { Judge, type JudgeRequest, type JudgeVerdict } from '../src/scoring/judge/judge.js';

/**
 * Deterministic stand-in for Hermes: the "strong" model writes the right
 * answer, the "weak" model writes a wrong one. Lets us test orchestration,
 * scoring, persistence and statistics without network access.
 */
class FakeExecutor extends AgentExecutor {
  readonly requests: ExecutionRequest[] = [];

  execute(job: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome> {
    this.requests.push(job);
    if (job.config.model.model === 'unscorable-model') {
      // Completed, but pointing at a workspace that does not exist, so scoring fails.
      return Promise.resolve({
        kind: 'completed',
        termination: 'completed',
        finalOutput: 'done',
        workspaceDir: join(job.runDir, 'missing'),
        durationMs: 5,
        exitCode: 0,
        stderrTail: null,
        tokens: null,
        reportedModel: null,
        sessionId: null,
        apiCalls: 1,
        costUsd: 0,
      });
    }
    const workspaceDir = join(job.runDir, 'work');
    mkdirSync(workspaceDir, { recursive: true });
    const strong = job.config.model.model === 'strong-model';
    const at = new Date().toISOString();
    hooks.onEvent({
      type: 'session',
      at,
      model: job.config.model.model,
      sessionId: job.runId,
    });
    hooks.onEvent({
      type: 'tool_call',
      at,
      callId: null,
      tool: 'write_file',
      arguments: { path: 'answer.txt' },
    });
    writeFileSync(join(workspaceDir, 'answer.txt'), strong ? '42' : '41');
    hooks.onEvent({ type: 'text', at, text: 'done' });
    return Promise.resolve({
      kind: 'completed',
      termination: 'completed',
      finalOutput: 'done',
      workspaceDir,
      durationMs: 5,
      exitCode: 0,
      stderrTail: null,
      tokens: { input: 10, output: 5, cacheRead: 0, total: 15 },
      reportedModel: job.config.model.model,
      sessionId: job.runId,
      apiCalls: 2,
      costUsd: 0,
    });
  }
}

/** Deterministic judge: rates every criterion 4/5 and reports fixed usage. */
class FakeJudge extends Judge {
  readonly requests: JudgeRequest[] = [];

  evaluate(judgeRequest: JudgeRequest): Promise<JudgeVerdict> {
    this.requests.push(judgeRequest);
    return Promise.resolve({
      criteria: judgeRequest.criteria.map((criterion) => ({
        key: criterion.key,
        rating: 4,
        reason: 'Clear.',
      })),
      overallReason: 'Helpful reply.',
      usage: { inputTokens: 200, outputTokens: 40, costUsd: 0.0005, requests: 1 },
    });
  }
}

const judgedSuite = (judgeModel: string): SuiteInput => ({
  name: `Judged by ${judgeModel}`,
  tasks: Array.from({ length: 5 }, (_, index) => ({
    key: `reply-${String(index)}`,
    title: `Reply ${String(index)}`,
    prompt: 'Reply to the customer.',
    scorers: [
      { type: 'contains', target: { kind: 'final_output' }, value: 'done' },
      {
        type: 'llm_judge',
        target: { kind: 'final_output' },
        judge: { provider: 'openrouter', model: judgeModel },
        rubric: 'Be helpful.',
        criteria: [{ key: 'helpfulness', description: 'Moves the customer forward' }],
      },
    ],
  })),
});

const suite: SuiteInput = {
  name: 'Arithmetic',
  tasks: Array.from({ length: 6 }, (_, index) => ({
    key: `task-${String(index)}`,
    title: `Task ${String(index)}`,
    prompt: 'Write the answer to answer.txt',
    scorers: [
      { type: 'file_exists', path: 'answer.txt' },
      { type: 'regex', target: { kind: 'file', path: 'answer.txt' }, pattern: '^42$' },
    ],
  })),
};

const idOf = (body: unknown): string => z.object({ id: z.string() }).parse(body).id;

const config = (name: string, model: string): AgentConfigInput => ({
  name,
  model: { provider: 'openrouter', model },
  toolsets: ['file'],
});

describe('Experiment flow (e2e)', () => {
  let app: NestExpressApplication | undefined;
  const executor = new FakeExecutor();
  const judge = new FakeJudge();
  const server = (): App => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentExecutor)
      .useValue(executor)
      .overrideProvider(Judge)
      .useValue(judge)
      .compile();
    const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(instance);
    await instance.init();
    app = instance;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs both arms, scores every run and reports a verdict', async () => {
    const suiteId = idOf(
      (await request(server()).post('/api/suites').send(suite).expect(201)).body,
    );
    const baselineId = idOf(
      (await request(server()).post('/api/configs').send(config('Weak', 'weak-model')).expect(201))
        .body,
    );
    const candidateId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Strong', 'strong-model'))
          .expect(201)
      ).body,
    );

    const created = experimentSchema.parse(
      (
        await request(server())
          .post('/api/experiments')
          .send({
            name: 'Weak vs strong',
            suiteId,
            baselineConfigId: baselineId,
            candidateConfigId: candidateId,
            repetitions: 2,
          })
          .expect(201)
      ).body,
    );
    expect(created.progress.total).toBe(24);

    let experiment: Experiment = created;
    for (let attempt = 0; attempt < 100 && experiment.status !== 'completed'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      experiment = experimentSchema.parse(
        (await request(server()).get(`/api/experiments/${created.id}`)).body,
      );
    }
    expect(experiment.status).toBe('completed');
    expect(experiment.progress.scored).toBe(24);

    const comparison: Comparison = comparisonSchema.parse(
      (await request(server()).get(`/api/experiments/${created.id}/comparison`).expect(200)).body,
    );
    expect(comparison).toMatchObject({
      pairedTasks: 6,
      meanDifference: 0.5,
      verdict: 'candidate_better',
      baseline: { passRate: 0, meanScore: 0.5 },
      candidate: { passRate: 1, meanScore: 1 },
    });

    const runs = z
      .array(runSummarySchema)
      .parse((await request(server()).get(`/api/experiments/${created.id}/runs`).expect(200)).body);
    const weakRun = runs.find((run) => run.arm === 'baseline');
    const detail = runDetailSchema.parse(
      (
        await request(server())
          .get(`/api/runs/${weakRun?.id ?? ''}`)
          .expect(200)
      ).body,
    );
    expect(detail.scores[1]).toMatchObject({ passed: false });
    expect(detail.scores[1]?.reason).toContain('does not match');
    expect(detail.events.map((event) => event.type)).toEqual(['session', 'tool_call', 'text']);
    expect(detail.workspaceFiles).toEqual([{ path: 'answer.txt', bytes: 2 }]);
  });

  it('records a scoring failure as an errored run and still finishes the experiment', async () => {
    const suiteId = idOf(
      (
        await request(server())
          .post('/api/suites')
          .send({ ...suite, name: 'Scoring failure' })
          .expect(201)
      ).body,
    );
    const okId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Fine', 'strong-model'))
          .expect(201)
      ).body,
    );
    const brokenId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Broken', 'unscorable-model'))
          .expect(201)
      ).body,
    );
    const created = experimentSchema.parse(
      (
        await request(server())
          .post('/api/experiments')
          .send({
            name: 'Scoring failure',
            suiteId,
            baselineConfigId: okId,
            candidateConfigId: brokenId,
          })
          .expect(201)
      ).body,
    );
    let experiment: Experiment = created;
    for (let attempt = 0; attempt < 100 && experiment.status !== 'completed'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      experiment = experimentSchema.parse(
        (await request(server()).get(`/api/experiments/${created.id}`)).body,
      );
    }
    expect(experiment.status).toBe('completed');
    expect(experiment.progress).toMatchObject({ running: 0, queued: 0, scored: 6, errored: 6 });
    const runs = z
      .array(runSummarySchema)
      .parse((await request(server()).get(`/api/experiments/${created.id}/runs`).expect(200)).body);
    expect(
      runs.filter((run) => run.arm === 'candidate').every((run) => run.errorKind === 'scoring'),
    ).toBe(true);
  });

  it('scores with an LLM judge and reports its details and cost separately', async () => {
    const suiteId = idOf(
      (await request(server()).post('/api/suites').send(judgedSuite('judge/model')).expect(201))
        .body,
    );
    const baselineId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Judged A', 'weak-model'))
          .expect(201)
      ).body,
    );
    const candidateId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Judged B', 'strong-model'))
          .expect(201)
      ).body,
    );
    const created = experimentSchema.parse(
      (
        await request(server())
          .post('/api/experiments')
          .send({
            name: 'Judged',
            suiteId,
            baselineConfigId: baselineId,
            candidateConfigId: candidateId,
          })
          .expect(201)
      ).body,
    );
    let experiment: Experiment = created;
    for (let attempt = 0; attempt < 100 && experiment.status !== 'completed'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      experiment = experimentSchema.parse(
        (await request(server()).get(`/api/experiments/${created.id}`)).body,
      );
    }
    expect(experiment.progress).toMatchObject({ scored: 10, errored: 0 });

    const comparison = comparisonSchema.parse(
      (await request(server()).get(`/api/experiments/${created.id}/comparison`).expect(200)).body,
    );
    expect(comparison.baseline).toMatchObject({ judgeRequests: 5, judgeTokens: 1200 });
    expect(comparison.baseline.judgeCostUsd).toBeCloseTo(0.0025, 6);

    const runs = z
      .array(runSummarySchema)
      .parse((await request(server()).get(`/api/experiments/${created.id}/runs`).expect(200)).body);
    const detail = runDetailSchema.parse(
      (
        await request(server())
          .get(`/api/runs/${runs[0]?.id ?? ''}`)
          .expect(200)
      ).body,
    );
    expect(detail.scores[1]).toMatchObject({
      type: 'llm_judge',
      score: 0.75,
      details: {
        model: 'judge/model',
        criteria: [{ key: 'helpfulness', rating: 4, reason: 'Clear.' }],
      },
    });
    expect(judge.requests[0]?.taskPrompt).toBe('Reply to the customer.');
  });

  it('refuses to launch when the judge is also a model under test', async () => {
    const suiteId = idOf(
      (await request(server()).post('/api/suites').send(judgedSuite('strong-model')).expect(201))
        .body,
    );
    const baselineId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Self A', 'weak-model'))
          .expect(201)
      ).body,
    );
    const candidateId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Self B', 'strong-model'))
          .expect(201)
      ).body,
    );
    const response = await request(server())
      .post('/api/experiments')
      .send({
        name: 'Self-judged',
        suiteId,
        baselineConfigId: baselineId,
        candidateConfigId: candidateId,
      })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('also a model under test');
  });

  it('snapshots configurations so later edits do not change a launched experiment', async () => {
    const suiteId = idOf(
      (
        await request(server())
          .post('/api/suites')
          .send({ ...suite, name: 'Snapshot' })
          .expect(201)
      ).body,
    );
    const baselineId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Snap A', 'weak-model'))
          .expect(201)
      ).body,
    );
    const candidateId = idOf(
      (
        await request(server())
          .post('/api/configs')
          .send(config('Snap B', 'strong-model'))
          .expect(201)
      ).body,
    );
    const launched = experimentSchema.parse(
      (
        await request(server())
          .post('/api/experiments')
          .send({
            name: 'Snapshot',
            suiteId,
            baselineConfigId: baselineId,
            candidateConfigId: candidateId,
          })
          .expect(201)
      ).body,
    );

    await request(server())
      .put(`/api/configs/${candidateId}`)
      .send({ ...config('Snap B (edited)', 'edited-model'), toolsets: [] })
      .expect(200);

    const after = experimentSchema.parse(
      (await request(server()).get(`/api/experiments/${launched.id}`)).body,
    );
    expect(after.candidate).toEqual(launched.candidate);
    expect(after.candidate.model.model).toBe('strong-model');
    expect(executor.requests.some((job) => job.config.model.model === 'edited-model')).toBe(false);
  });

  it('rejects invalid input with field-level issues', async () => {
    const response = await request(server())
      .post('/api/configs')
      .send({ name: '', model: { provider: 'openrouter', model: 'x' }, toolsets: ['browser'] })
      .expect(400);
    expect(response.body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name' }),
        expect.objectContaining({ path: 'toolsets.0' }),
      ]),
    );
  });
});
