import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { agentConfigSchema, experimentSchema } from '@higheval/shared';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { AgentExecutor, type ExecutionOutcome } from '../src/execution/agent-executor.js';

/** Runs are not the point here; fail them fast and quietly. */
class IdleExecutor extends AgentExecutor {
  execute(): Promise<ExecutionOutcome> {
    return Promise.resolve({
      kind: 'errored',
      errorKind: 'setup',
      errorMessage: 'not executed in this test',
      retryable: false,
      durationMs: 0,
      exitCode: null,
      stderrTail: null,
      tokens: null,
      reportedModel: null,
      sessionId: null,
      apiCalls: null,
      costUsd: null,
    });
  }
}

const idOf = (body: unknown): string => z.object({ id: z.string() }).parse(body).id;

const suite = (fixtures: { path: string; content: string }[] = []) => ({
  name: `Suite ${String(Math.random())}`,
  tasks: [
    {
      key: 'hello',
      title: 'Hello',
      prompt: 'Reply with hello.',
      fixtures,
      scorers: [{ type: 'contains', target: { kind: 'final_output' }, value: 'hello' }],
    },
  ],
});

describe('Agent files (e2e)', () => {
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AgentExecutor)
      .useValue(new IdleExecutor())
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

  const createAgent = async (overrides: Record<string, unknown>) =>
    agentConfigSchema.parse(
      (
        await request(server())
          .post('/api/configs')
          .send({
            name: `Agent ${String(Math.random())}`,
            model: { provider: 'openrouter', model: 'vendor/model' },
            ...overrides,
          })
          .expect(201)
      ).body,
    );

  const launch = (suiteId: string, baselineConfigId: string, candidateConfigId: string) =>
    request(server())
      .post('/api/experiments')
      .send({ name: 'Files', suiteId, baselineConfigId, candidateConfigId });

  it('stores persona, instructions and both memory files, and snapshots them into the hash', async () => {
    const plain = await createAgent({});
    expect(plain).toMatchObject({ soul: null, instructions: null });
    const withFiles = await createAgent({
      soul: 'You are a careful billing coordinator.',
      instructions: 'Cite the policy you apply.',
      memory: {
        mode: 'seeded',
        entries: ['Fiscal year starts April 1.'],
        userProfile: ['Prefers SMS.'],
      },
    });
    expect(withFiles.memory).toEqual({
      mode: 'seeded',
      entries: ['Fiscal year starts April 1.'],
      userProfile: ['Prefers SMS.'],
    });

    const suiteId = idOf(
      (await request(server()).post('/api/suites').send(suite()).expect(201)).body,
    );
    const experiment = experimentSchema.parse(
      (await launch(suiteId, plain.id, withFiles.id).expect(201)).body,
    );
    expect(experiment.candidate).toMatchObject({
      soul: 'You are a careful billing coordinator.',
      instructions: 'Cite the policy you apply.',
    });
    expect(experiment.candidate.hash).not.toBe(experiment.baseline.hash);

    // Same behaviour, different name: same hash.
    const twin = await createAgent({});
    const again = experimentSchema.parse(
      (await launch(suiteId, plain.id, twin.id).expect(201)).body,
    );
    expect(again.candidate.hash).toBe(again.baseline.hash);
  });

  it('rejects empty seeded memory and oversized files', async () => {
    const empty = await request(server())
      .post('/api/configs')
      .send({
        name: 'Empty',
        model: { provider: 'openrouter', model: 'vendor/model' },
        memory: { mode: 'seeded', entries: [], userProfile: [] },
      })
      .expect(400);
    expect(empty.body.issues[0]).toMatchObject({ path: 'memory.entries' });
    const huge = await request(server())
      .post('/api/configs')
      .send({
        name: 'Huge',
        model: { provider: 'openrouter', model: 'vendor/model' },
        soul: 'x'.repeat(20_001),
      })
      .expect(400);
    expect(huge.body.issues[0]).toMatchObject({ path: 'soul' });
  });

  it('refuses to launch when a task file would hide the agent’s AGENTS.md', async () => {
    const plain = await createAgent({});
    const instructed = await createAgent({ instructions: 'Cite the policy you apply.' });
    const suiteId = idOf(
      (
        await request(server())
          .post('/api/suites')
          .send(suite([{ path: 'CLAUDE.md', content: 'Project rules.' }]))
          .expect(201)
      ).body,
    );
    const response = await launch(suiteId, plain.id, instructed.id).expect(400);
    expect(response.body.issues).toEqual([
      expect.objectContaining({
        path: 'candidateConfigId',
        message: expect.stringContaining('hello/CLAUDE.md'),
      }),
    ]);
    // Without instructions on either agent, the same suite launches.
    await launch(suiteId, plain.id, (await createAgent({})).id).expect(201);
  });
});
