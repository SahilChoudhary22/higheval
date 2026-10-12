import type { AgentEvent, ConfigSnapshot } from '@higheval/shared';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCredentials } from '../../providers/testing.js';
import type { ExecutionOutcome } from '../agent-executor.js';
import { HermesExecutor } from './hermes.executor.js';

/**
 * Stand-in for the Hermes CLI: a Node script that reads the prompt file passed
 * via --query-file and behaves according to a keyword in it, emitting the same
 * stream-json lines Hermes does. Exercises the real executor (process
 * management, run directory, parsing, classification) without a model.
 */
const FAKE_HERMES = `
const fs = require('node:fs');
const args = process.argv;
const prompt = fs.readFileSync(args[args.indexOf('--query-file') + 1], 'utf8');
const emit = (event) => process.stdout.write(JSON.stringify({ ...event, timestamp: Date.now() }) + '\\n');
const tokens = { input: 120, output: 30, total: 150, cache_read: 0, cache_write: 0 };
emit({ type: 'system', subtype: 'init', model: 'fake/model', session_id: 's-1' });
if (prompt.includes('SUCCEED')) {
  emit({ type: 'tool_use', name: 'write_file', input: { path: 'answer.txt' } });
  fs.writeFileSync('answer.txt', '42');
  emit({ type: 'tool_result', name: 'write_file', output: '{"ok":true}', duration_ms: 3, is_error: false });
  emit({ type: 'text', text: 'Wrote ' });
  emit({ type: 'text', text: 'the answer.' });
  emit({ type: 'result', session_id: 's-1', exit_code: 0, text: 'Wrote the answer.', tokens, duration_ms: 10 });
} else if (prompt.includes('RATE_LIMIT')) {
  emit({ type: 'result', session_id: 's-1', exit_code: 1, text: 'rate limited', tokens, duration_ms: 10, error: 'HTTP 429: Provider returned error' });
  process.exit(1);
} else if (prompt.includes('CRASH')) {
  process.stderr.write('Traceback (most recent call last):\\nRuntimeError: boom\\n');
  process.exit(1);
} else if (prompt.includes('HANG')) {
  setInterval(() => {}, 1000);
}
`;

const snapshot: ConfigSnapshot = {
  id: 'c',
  name: 'Fake',
  description: '',
  model: { provider: 'openrouter', model: 'fake/model' },
  skills: [],
  memory: { mode: 'disabled' },
  soul: null,
  instructions: null,
  toolsets: ['file'],
  maxTurns: 5,
  timeoutSeconds: 60,
  hash: 'f'.repeat(64),
};

describe('HermesExecutor (fake Hermes CLI)', () => {
  let root: string;
  let executor: HermesExecutor;
  let counter = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'higheval-executor-'));
    const script = join(root, 'fake-hermes');
    writeFileSync(script, `#!${process.execPath}\n${FAKE_HERMES}`);
    chmodSync(script, 0o755);
    const manifest = join(root, 'manifest.json');
    writeFileSync(
      manifest,
      JSON.stringify({
        commit: 'abc',
        repo: root,
        python: script,
        runtimeDir: root,
        version: 'Fake Hermes',
      }),
    );
    const { config, credentials } = testCredentials({
      OPENROUTER_API_KEY: 'test-key',
      HERMES_MANIFEST: manifest,
      DATA_DIR: root,
    });
    executor = new HermesExecutor(config, credentials);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function run(
    prompt: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<{ outcome: ExecutionOutcome; events: AgentEvent[]; runDir: string }> {
    const runDir = join(root, `run-${String(++counter)}`);
    const events: AgentEvent[] = [];
    const outcome = await executor.execute(
      {
        runId: `r-${String(counter)}`,
        prompt,
        fixtures: [{ path: 'input.txt', content: 'data' }],
        config: snapshot,
        runDir,
      },
      { signal, onEvent: (event) => events.push(event) },
    );
    return { outcome, events, runDir };
  }

  it('runs a task end to end: fixtures, events, outputs, tokens and evidence logs', async () => {
    const { outcome, events, runDir } = await run('SUCCEED');
    expect(outcome).toMatchObject({
      kind: 'completed',
      termination: 'completed',
      finalOutput: 'Wrote the answer.',
      exitCode: 0,
      reportedModel: 'fake/model',
      sessionId: 's-1',
      tokens: { input: 120, output: 30, total: 150 },
    });
    expect(events.map((event) => event.type)).toEqual([
      'session',
      'tool_call',
      'tool_result',
      'text',
    ]);
    expect(readFileSync(join(runDir, 'work', 'answer.txt'), 'utf8')).toBe('42');
    expect(readFileSync(join(runDir, 'work', 'input.txt'), 'utf8')).toBe('data');
    expect(existsSync(join(runDir, 'work', '.git'))).toBe(true);
    expect(readFileSync(join(runDir, 'stdout.jsonl'), 'utf8')).toContain('"type":"result"');
  });

  it('writes an isolated per-run Hermes home and never passes the model on the command line', async () => {
    const { runDir } = await run('SUCCEED');
    const config: unknown = JSON.parse(readFileSync(join(runDir, 'home', 'config.yaml'), 'utf8'));
    expect(config).toMatchObject({
      model: { default: 'fake/model' },
      openrouter: { response_cache: false },
    });
    expect(readFileSync(join(runDir, 'stdout.jsonl'), 'utf8')).not.toContain('test-key');
  });

  it('classifies a provider rate limit as a retryable error', async () => {
    const { outcome } = await run('RATE_LIMIT');
    expect(outcome).toMatchObject({ kind: 'errored', errorKind: 'provider', retryable: true });
  });

  it('classifies an exit without a result event as a crash and keeps the stderr tail', async () => {
    const { outcome } = await run('CRASH');
    expect(outcome).toMatchObject({ kind: 'errored', errorKind: 'crash', retryable: false });
    expect(outcome.stderrTail).toContain('RuntimeError: boom');
  });

  it('stops a hanging run when cancelled', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const { outcome } = await run('HANG', controller.signal);
    expect(outcome.kind).toBe('cancelled');
  });

  it('reports a setup error when no provider key is configured', async () => {
    const { config, credentials } = testCredentials({
      HERMES_MANIFEST: join(root, 'manifest.json'),
      DATA_DIR: root,
    });
    const keyless = new HermesExecutor(config, credentials);
    const outcome = await keyless.execute(
      {
        runId: 'k',
        prompt: 'SUCCEED',
        fixtures: [],
        config: snapshot,
        runDir: join(root, 'keyless'),
      },
      { signal: new AbortController().signal, onEvent: () => undefined },
    );
    expect(outcome).toMatchObject({ kind: 'errored', errorKind: 'setup' });
  });
});
