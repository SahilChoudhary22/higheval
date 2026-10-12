import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  experimentSchema,
  runSummarySchema,
  type AgentConfigInput,
  type Experiment,
  type SuiteInput,
} from '@higheval/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AgentExecutor,
  type ExecutionHooks,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../src/execution/agent-executor.js';

type Behaviour = 'ok' | 'rate-limited-once' | 'hang';

/**
 * Executor whose behaviour is chosen per model: succeed, fail once with a
 * retryable rate limit, or hang until aborted. Lets the runner's retry,
 * cancellation and restart-recovery paths be tested deterministically.
 */
class ScriptedExecutor extends AgentExecutor {
  readonly attempts = new Map<string, number>();
  readonly started: string[] = [];

  constructor(private readonly behaviour: (model: string) => Behaviour) {
    super();
  }

  async execute(job: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome> {
    this.started.push(job.runId);
    const attempt = (this.attempts.get(job.runId) ?? 0) + 1;
    this.attempts.set(job.runId, attempt);
    const base = {
      durationMs: 1,
      exitCode: 0,
      stderrTail: null,
      tokens: null,
      reportedModel: job.config.model.model,
      sessionId: null,
      apiCalls: 1,
      costUsd: 0,
    };
    const mode = this.behaviour(job.config.model.model);
    if (mode === 'hang') {
      await new Promise<void>((resolve) => {
        if (hooks.signal.aborted) resolve();
        else hooks.signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return { ...base, kind: 'cancelled' };
    }
    if (mode === 'rate-limited-once' && attempt === 1) {
      return {
        ...base,
        kind: 'errored',
        errorKind: 'provider',
        errorMessage: 'HTTP 429',
        retryable: true,
      };
    }
    const workspaceDir = join(job.runDir, 'work');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'answer.txt'), '42');
    return {
      ...base,
      kind: 'completed',
      termination: 'completed',
      finalOutput: 'done',
      workspaceDir,
    };
  }
}

const suite: SuiteInput = {
  name: 'Resilience',
  tasks: [
    {
      key: 'only-task',
      title: 'Only task',
      prompt: 'Write 42 to answer.txt',
      scorers: [{ type: 'regex', target: { kind: 'file', path: 'answer.txt' }, pattern: '^42$' }],
    },
  ],
};
const config = (name: string, model: string): AgentConfigInput => ({
  name,
  model: { provider: 'openrouter', model },
});
const idOf = (body: unknown): string => z.object({ id: z.string() }).parse(body).id;

async function startApp(executor: AgentExecutor): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AgentExecutor)
    .useValue(executor)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

async function launch(server: App, baselineModel: string, candidateModel: string): Promise<string> {
  const suiteId = idOf((await request(server).post('/api/suites').send(suite).expect(201)).body);
  const baselineId = idOf(
    (
      await request(server)
        .post('/api/configs')
        .send(config(`A ${baselineModel}`, baselineModel))
        .expect(201)
    ).body,
  );
  const candidateId = idOf(
    (
      await request(server)
        .post('/api/configs')
        .send(config(`B ${candidateModel}`, candidateModel))
        .expect(201)
    ).body,
  );
  return idOf(
    (
      await request(server)
        .post('/api/experiments')
        .send({
          name: 'Resilience',
          suiteId,
          baselineConfigId: baselineId,
          candidateConfigId: candidateId,
        })
        .expect(201)
    ).body,
  );
}

async function waitFor(
  server: App,
  id: string,
  done: (experiment: Experiment) => boolean,
): Promise<Experiment> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const experiment = experimentSchema.parse(
      (await request(server).get(`/api/experiments/${id}`)).body,
    );
    if (done(experiment)) return experiment;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Experiment ${id} did not reach the expected state`);
}

const runsOf = async (server: App, id: string) =>
  z
    .array(runSummarySchema)
    .parse((await request(server).get(`/api/experiments/${id}/runs`).expect(200)).body);

describe('Experiment runner resilience (e2e)', () => {
  it('retries a rate-limited run and scores the second attempt', async () => {
    const app = await startApp(
      new ScriptedExecutor((model) => (model === 'flaky' ? 'rate-limited-once' : 'ok')),
    );
    try {
      const server = app.getHttpServer();
      const id = await launch(server, 'steady', 'flaky');
      const experiment = await waitFor(server, id, (current) => current.status === 'completed');
      expect(experiment.progress).toMatchObject({ scored: 2, errored: 0 });
      const flaky = (await runsOf(server, id)).find((run) => run.arm === 'candidate');
      expect(flaky).toMatchObject({ status: 'scored', attempts: 2, score: 1 });
    } finally {
      await app.close();
    }
  });

  it('cancels a run in flight and leaves nothing queued', async () => {
    const app = await startApp(new ScriptedExecutor(() => 'hang'));
    try {
      const server = app.getHttpServer();
      const id = await launch(server, 'stuck-a', 'stuck-b');
      await waitFor(server, id, (current) => current.progress.running > 0);
      await request(server).post(`/api/experiments/${id}/cancel`).expect(200);
      const experiment = await waitFor(server, id, (current) => current.progress.running === 0);
      expect(experiment.status).toBe('cancelled');
      expect(experiment.progress).toMatchObject({ queued: 0, running: 0, cancelled: 2 });
    } finally {
      await app.close();
    }
  });

  it('recovers runs interrupted by a restart and completes them', async () => {
    // First process: runs hang, then the server shuts down mid-run.
    const first = await startApp(new ScriptedExecutor(() => 'hang'));
    const id = await launch(first.getHttpServer(), 'restart-a', 'restart-b');
    await waitFor(first.getHttpServer(), id, (current) => current.progress.running > 0);
    await first.close();

    // Second process on the same database: stranded runs are re-queued and finish.
    const executor = new ScriptedExecutor(() => 'ok');
    const second = await startApp(executor);
    try {
      const experiment = await waitFor(
        second.getHttpServer(),
        id,
        (current) => current.status === 'completed',
      );
      expect(experiment.progress).toMatchObject({ scored: 2, running: 0, queued: 0 });
      const runs = await runsOf(second.getHttpServer(), id);
      expect(runs.every((run) => run.attempts >= 2)).toBe(true);
      expect(executor.started.length).toBeGreaterThan(0);
    } finally {
      await second.close();
    }
  });
});
