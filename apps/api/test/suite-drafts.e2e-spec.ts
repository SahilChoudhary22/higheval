import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { suiteDraftSchema, suiteInputSchema, type SuiteDraft } from '@higheval/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  AgentExecutor,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../src/execution/agent-executor.js';

/** Writes a fixed, valid suite and reference, as a well-behaved Hermes would. */
class DraftingExecutor extends AgentExecutor {
  execute(job: ExecutionRequest): Promise<ExecutionOutcome> {
    const workspaceDir = join(job.runDir, 'work');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(
      join(workspaceDir, 'suite.json'),
      JSON.stringify({
        name: 'Refunds',
        tasks: [
          {
            key: 'refund-window',
            title: 'Refund window',
            prompt: 'State the refund window.',
            scorers: [{ type: 'regex', target: { kind: 'final_output' }, pattern: '30 days' }],
          },
        ],
      }),
    );
    writeFileSync(
      join(workspaceDir, 'reference.json'),
      JSON.stringify({ 'refund-window': { output: 'Refunds are accepted within 30 days.' } }),
    );
    return Promise.resolve({
      kind: 'completed',
      termination: 'completed',
      finalOutput: 'DONE',
      workspaceDir,
      durationMs: 1,
      exitCode: 0,
      stderrTail: null,
      tokens: null,
      reportedModel: null,
      sessionId: null,
      apiCalls: null,
      costUsd: null,
    });
  }
}

describe('Suite drafts (e2e)', () => {
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentExecutor)
      .useValue(new DraftingExecutor())
      .compile();
    const instance = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(instance);
    await instance.init();
    app = instance;
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = (): App => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };

  it('drafts a suite that can be saved unchanged', async () => {
    const started = await request(server())
      .post('/api/suite-drafts')
      .send({ description: 'One task checking the agent states our 30-day refund window.' })
      .expect(202);
    let draft: SuiteDraft = suiteDraftSchema.parse(started.body);
    for (let tick = 0; tick < 100 && draft.status === 'running'; tick++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      draft = suiteDraftSchema.parse(
        (await request(server()).get(`/api/suite-drafts/${draft.id}`).expect(200)).body,
      );
    }
    expect(draft).toMatchObject({ status: 'ready', attempt: 1, error: null });
    expect(draft.checks).toEqual([{ taskKey: 'refund-window', passed: true, problems: [] }]);

    const saved = await request(server())
      .post('/api/suites')
      .send(draft.suite ?? {})
      .expect(201);
    expect(suiteInputSchema.safeParse(saved.body).success).toBe(true);
  });

  it('validates the description and reports unknown drafts', async () => {
    const response = await request(server())
      .post('/api/suite-drafts')
      .send({ description: 'short' })
      .expect(400);
    expect(response.body.issues[0].path).toBe('description');
    await request(server()).get('/api/suite-drafts/nope').expect(404);
    await request(server()).post('/api/suite-drafts/nope/cancel').expect(404);
  });
});
