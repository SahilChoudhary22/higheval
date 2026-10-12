import type { INestApplication } from '@nestjs/common';
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
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import {
  AgentExecutor,
  type ExecutionHooks,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../src/execution/agent-executor.js';

/**
 * Deterministic stand-in for Hermes: the "strong" model writes the right
 * answer, the "weak" model writes a wrong one. Lets us test orchestration,
 * scoring, persistence and statistics without network access.
 */
class FakeExecutor extends AgentExecutor {
  readonly requests: ExecutionRequest[] = [];

  execute(job: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome> {
    this.requests.push(job);
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
  let app: INestApplication<App> | undefined;
  const executor = new FakeExecutor();
  const server = (): App => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentExecutor)
      .useValue(executor)
      .compile();
    const instance = moduleRef.createNestApplication<INestApplication<App>>();
    instance.setGlobalPrefix('api');
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

  it('snapshots configurations so later edits do not change a launched experiment', () => {
    const hashes = new Set(executor.requests.map((job) => `${job.config.name}:${job.config.hash}`));
    expect(hashes.size).toBe(2);
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
