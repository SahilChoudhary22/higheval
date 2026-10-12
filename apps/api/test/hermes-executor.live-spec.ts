import { ConfigService } from '@nestjs/config';
import type { AgentEvent, ConfigSnapshot } from '@higheval/shared';
import Database from 'better-sqlite3';
import { config as loadDotenv } from 'dotenv';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateEnv } from '../src/config/env.schema.js';
import { REPO_ROOT } from '../src/config/paths.js';
import type { ExecutionOutcome } from '../src/execution/agent-executor.js';
import { loadHermesRuntime } from '../src/execution/hermes/hermes-runtime.js';
import { HermesExecutor } from '../src/execution/hermes/hermes.executor.js';

/**
 * Live verification that configuration controls actually change Hermes'
 * runtime behaviour, and that runs are isolated from the host and each other.
 * Run with `pnpm --filter @higheval/api test:live` (uses real model requests).
 */
loadDotenv({ path: resolve(REPO_ROOT, '.env'), quiet: true });
const env = validateEnv(process.env);
const MODEL = process.env.LIVE_MODEL ?? 'nvidia/nemotron-3.5-lightning:free';
const ready =
  loadHermesRuntime(env.HERMES_MANIFEST) !== null && env.OPENROUTER_API_KEY !== undefined;

const baseConfig: ConfigSnapshot = {
  id: 'live',
  name: 'Live',
  description: '',
  model: { provider: 'openrouter', model: MODEL },
  skills: [],
  memory: { mode: 'disabled' },
  toolsets: ['file'],
  maxTurns: 8,
  timeoutSeconds: 180,
  hash: '0'.repeat(64),
};

function systemPrompt(runDir: string): string {
  const db = new Database(join(runDir, 'home', 'state.db'), { readonly: true });
  try {
    const row: unknown = db.prepare('SELECT system_prompt FROM sessions LIMIT 1').get();
    return typeof row === 'object' && row !== null && 'system_prompt' in row
      ? String(row.system_prompt)
      : '';
  } finally {
    db.close();
  }
}

describe.skipIf(!ready)('HermesExecutor (live)', () => {
  const executor = new HermesExecutor(new ConfigService(env));
  // Inside the repository on purpose, like real runs under DATA_DIR, so the
  // leak test below exercises Hermes' upward discovery of project context.
  const liveRoot = resolve(REPO_ROOT, 'data', 'live-tests');
  mkdirSync(liveRoot, { recursive: true });
  const root = mkdtempSync(join(liveRoot, 'run-'));
  let counter = 0;

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function run(
    prompt: string,
    config: Partial<ConfigSnapshot> = {},
    fixtures: { path: string; content: string }[] = [],
  ): Promise<{ outcome: ExecutionOutcome; events: AgentEvent[]; runDir: string }> {
    const runDir = join(root, `run-${String(++counter)}`);
    const events: AgentEvent[] = [];
    const outcome = await executor.execute(
      {
        runId: `live-${String(counter)}`,
        prompt,
        fixtures,
        config: { ...baseConfig, ...config },
        runDir,
      },
      { signal: new AbortController().signal, onEvent: (event) => events.push(event) },
    );
    if (outcome.kind === 'errored')
      throw new Error(`${outcome.errorKind}: ${outcome.errorMessage}`);
    return { outcome, events, runDir };
  }

  it('uses file tools, writes output and reports accounting', async () => {
    const { outcome, events, runDir } = await run(
      'Read numbers.txt, add the numbers, and write only the sum to sum.txt. Then reply "done".',
      {},
      [{ path: 'numbers.txt', content: '17\n25\n58\n' }],
    );
    expect(outcome.kind).toBe('completed');
    expect(readFileSync(join(runDir, 'work', 'sum.txt'), 'utf8').trim()).toBe('100');
    expect(events.some((event) => event.type === 'tool_call' && event.tool === 'read_file')).toBe(
      true,
    );
    expect(outcome.reportedModel).toBe(MODEL);
    expect(outcome.apiCalls).toBeGreaterThan(0);
    expect(outcome.tokens?.total).toBeGreaterThan(0);
  });

  it('offers no tools when the configuration selects none', async () => {
    const { outcome, events } = await run(
      'List the files in the current directory using any tool you have. If you have no tools, reply exactly NO_TOOLS.',
      { toolsets: [] },
    );
    expect(outcome.kind).toBe('completed');
    expect(events.filter((event) => event.type === 'tool_call')).toEqual([]);
  });

  it('exposes a skill only to configurations that include it', async () => {
    const skill = {
      name: 'sign-off-policy',
      description: 'Company policy for how to end every reply',
      content: 'Always end every reply with the exact sign-off line: "-- Ref ZEBRA-7731".',
    };
    const prompt = 'In one sentence, say hello to a new customer.';
    const withSkill = await run(prompt, { toolsets: [], skills: [skill] });
    const withoutSkill = await run(prompt, { toolsets: [] });
    expect(withSkill.outcome.kind === 'completed' && withSkill.outcome.finalOutput).toContain(
      'ZEBRA-7731',
    );
    expect(
      withoutSkill.outcome.kind === 'completed' && withoutSkill.outcome.finalOutput,
    ).not.toContain('ZEBRA-7731');
  });

  it('injects seeded memory only when memory is configured', async () => {
    const prompt =
      'What is the account code for Northwind Traders? Reply with just the code, or UNKNOWN if you do not know it.';
    const seeded = await run(prompt, {
      toolsets: [],
      memory: { mode: 'seeded', entries: ['Northwind Traders account code is NW-5521.'] },
    });
    const disabled = await run(prompt, { toolsets: [] });
    expect(seeded.outcome.kind === 'completed' && seeded.outcome.finalOutput).toContain('NW-5521');
    expect(disabled.outcome.kind === 'completed' && disabled.outcome.finalOutput).not.toContain(
      'NW-5521',
    );
  });

  it('keeps host project context and unselected skills out of the system prompt', async () => {
    const { runDir } = await run('Reply with OK.', { toolsets: [] });
    const prompt = systemPrompt(runDir);
    expect(prompt.length).toBeGreaterThan(0);
    // Coding-context snapshot of the enclosing repo (scripts, git state) must be off.
    expect(prompt).not.toContain('package.json');
    expect(prompt).not.toContain('pnpm');
    // No skills index: none were selected and bundled skills are never seeded.
    expect(prompt).not.toMatch(/skills_list|skill_view/);
  });
});
