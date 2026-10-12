import { suiteInputSchema, type SuiteDraft } from '@higheval/shared';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentExecutor,
  type ExecutionHooks,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../execution/agent-executor.js';
import { testCredentials } from '../providers/testing.js';
import { SuiteAssistantService } from './suite-assistant.service.js';

const VALID_SUITE = {
  name: 'Greetings',
  tasks: [
    {
      key: 'say-hello',
      title: 'Say hello',
      prompt: 'Reply with hello.',
      scorers: [{ type: 'contains', target: { kind: 'final_output' }, value: 'hello' }],
    },
  ],
};
const REFERENCE = { 'say-hello': { output: 'hello' } };

const BASE = {
  durationMs: 1,
  exitCode: 0,
  stderrTail: null,
  tokens: null,
  reportedModel: null,
  sessionId: null,
  apiCalls: null,
  costUsd: null,
};

type Step = (request: ExecutionRequest, hooks: ExecutionHooks) => Promise<ExecutionOutcome>;

/** Plays one scripted step per attempt, writing the agent's files into its workspace. */
class ScriptedExecutor extends AgentExecutor {
  readonly requests: ExecutionRequest[] = [];
  constructor(private readonly steps: Step[]) {
    super();
  }
  execute(request: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome> {
    this.requests.push(request);
    const step = this.steps[this.requests.length - 1];
    if (!step) throw new Error('No scripted step left');
    return step(request, hooks);
  }
}

const writes =
  (files: Record<string, string>): Step =>
  (request, hooks) => {
    const workspaceDir = join(request.runDir, 'work');
    mkdirSync(workspaceDir, { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      hooks.onEvent({
        type: 'tool_call',
        at: new Date().toISOString(),
        callId: null,
        tool: 'write_file',
        arguments: { path },
      });
      writeFileSync(join(workspaceDir, path), content);
    }
    return Promise.resolve({
      ...BASE,
      kind: 'completed',
      termination: 'completed',
      finalOutput: 'DONE',
      workspaceDir,
    });
  };

/** Waits for a draft to leave the running state. */
async function settled(assistant: SuiteAssistantService, id: string): Promise<SuiteDraft> {
  for (let tick = 0; tick < 200; tick++) {
    const draft = assistant.get(id);
    if (draft.status !== 'running') return draft;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Draft did not finish');
}

describe('SuiteAssistantService', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'higheval-assistant-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const service = (
    steps: Step[],
    env: Record<string, unknown> = { OPENROUTER_API_KEY: 'test-key' },
  ) => {
    const executor = new ScriptedExecutor(steps);
    const { config, credentials } = testCredentials({ DATA_DIR: dataDir, ...env });
    return { executor, assistant: new SuiteAssistantService(executor, config, credentials) };
  };

  it('retries with the problems found until the draft passes its own checks', async () => {
    const { executor, assistant } = service([
      writes({ 'suite.json': JSON.stringify({ name: 'Greetings', tasks: [] }) }),
      writes({
        'suite.json': JSON.stringify(VALID_SUITE),
        'reference.json': JSON.stringify(REFERENCE),
      }),
    ]);
    const started = assistant.start({ description: 'One task that checks the agent says hello.' });
    expect(started).toMatchObject({ status: 'running', attempt: 1, revision: false });

    const draft = await settled(assistant, started.id);
    expect(draft).toMatchObject({ status: 'ready', attempt: 2, error: null });
    expect(draft.suite?.tasks[0]?.key).toBe('say-hello');
    expect(draft.checks).toEqual([{ taskKey: 'say-hello', passed: true, problems: [] }]);
    expect(draft.activity.map((entry) => entry.text)).toContain('write_file: suite.json');

    const [first, second] = executor.requests;
    expect(first?.config.skills.map((skill) => skill.name)).toEqual(['suite-authoring']);
    expect(first?.config.toolsets).toEqual(['file', 'terminal']);
    expect(first?.providerSort).toBe('throughput');
    // Inputs travel in the prompt, so the agent spends no tool calls reading them.
    expect(first?.fixtures).toEqual([]);
    expect(first?.prompt).toContain('One task that checks the agent says hello.');
    expect(first?.prompt).toContain('## Suite JSON Schema');
    expect(first?.prompt).not.toContain('## Current suite');
    // HighEval validates the files, so the agent should not spend tool calls doing it too.
    expect(first?.prompt).toContain('Do not validate suite.json against the schema yourself');
    expect(second?.prompt).toContain('## Your previous attempt');
    expect(second?.prompt).toContain('- suite.json tasks: Add at least one');
  });

  it('gives a revision the current suite to work from', async () => {
    const { executor, assistant } = service([
      writes({
        'suite.json': JSON.stringify(VALID_SUITE),
        'reference.json': JSON.stringify(REFERENCE),
      }),
    ]);
    const started = assistant.start({
      description: 'Make the greeting task stricter, please.',
      suite: suiteInputSchema.parse(VALID_SUITE),
    });
    await settled(assistant, started.id);
    expect(started.revision).toBe(true);
    expect(executor.requests[0]?.prompt).toContain('## Current suite');
    expect(executor.requests[0]?.prompt).toContain('"key": "say-hello"');
  });

  it('fails with the last problems when no attempt produces a valid suite', async () => {
    const empty = writes({});
    const { assistant } = service([empty, empty, empty]);
    const draft = await settled(
      assistant,
      assistant.start({ description: 'Something the agent never writes.' }).id,
    );
    expect(draft.status).toBe('failed');
    expect(draft.error).toContain('suite.json was not written.');
  });

  it('reports an agent that could not run', async () => {
    const { assistant } = service([
      () =>
        Promise.resolve({
          ...BASE,
          kind: 'errored',
          errorKind: 'provider',
          errorMessage: 'Invalid model',
          retryable: false,
        }),
    ]);
    const draft = await settled(
      assistant,
      assistant.start({ description: 'Anything at all, it will not run.' }).id,
    );
    expect(draft).toMatchObject({ status: 'failed', error: 'Invalid model' });
  });

  it('stops a running draft on cancel', async () => {
    const { assistant } = service([
      (_request, hooks) =>
        new Promise((resolve) => {
          hooks.signal.addEventListener('abort', () => resolve({ ...BASE, kind: 'cancelled' }));
        }),
    ]);
    const started = assistant.start({ description: 'A draft that will be cancelled.' });
    expect(assistant.cancel(started.id).status).toBe('cancelled');
    expect((await settled(assistant, started.id)).status).toBe('cancelled');
  });

  it('refuses to start without a key for the assistant model', () => {
    const { assistant } = service([], {});
    expect(() => assistant.start({ description: 'Needs a key that is not there.' })).toThrow(
      'Validation failed',
    );
  });

  it('returns 404 for unknown drafts', () => {
    expect(() => service([]).assistant.get('missing')).toThrow('Draft missing not found');
  });
});
