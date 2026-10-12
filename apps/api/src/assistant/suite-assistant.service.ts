import { Injectable, Logger, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROVIDERS,
  suiteInputSchema,
  type AgentEvent,
  type ConfigSnapshot,
  type FixtureFile,
  type SuiteDraft,
  type suiteDraftRequestSchema,
} from '@higheval/shared';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { sha256Hex } from '../common/hash.js';
import { newId, nowIso } from '../common/ids.js';
import { validationError } from '../common/validation-error.js';
import type { Env } from '../config/env.schema.js';
import { AgentExecutor } from '../execution/agent-executor.js';
import { ProviderCredentials } from '../providers/provider-credentials.service.js';
import { AGENCY_OPS_SUITE } from '../samples/agency-ops-suite.js';
import { CUSTOMER_CONVERSATIONS_SUITE } from '../samples/customer-conversations-suite.js';
import { reviewDraft } from './draft-review.js';
import { SUITE_AUTHORING_SKILL } from './suite-authoring-skill.js';

export type SuiteDraftData = z.output<typeof suiteDraftRequestSchema>;

/** Fresh Hermes runs per draft; each retry sees the previous draft and what was wrong with it. */
export const MAX_DRAFT_ATTEMPTS = 3;
/** Drafts are working state, kept in memory; older ones are dropped. */
const MAX_KEPT_DRAFTS = 20;
const MAX_ACTIVITY = 12;
const MAX_OUTPUT_BYTES = 1_000_000;

const SUITE_JSON_SCHEMA = JSON.stringify(
  z.toJSONSchema(suiteInputSchema, { io: 'input', unrepresentable: 'any' }),
  null,
  2,
);

/** Two known-good tasks: one deterministic, one judged. */
const EXAMPLE_SUITE = JSON.stringify(
  {
    name: 'Example',
    description: 'Excerpt from the sample suites.',
    tasks: [AGENCY_OPS_SUITE.tasks[0], CUSTOMER_CONVERSATIONS_SUITE.tasks[0]],
  },
  null,
  2,
);

interface Job {
  draft: SuiteDraft;
  controller: AbortController;
}

/** One line describing an agent event, for the progress view. */
function describeEvent(event: AgentEvent): string | null {
  switch (event.type) {
    case 'tool_call': {
      const args: Record<string, unknown> =
        typeof event.arguments === 'object' && event.arguments !== null
          ? Object.fromEntries(Object.entries(event.arguments))
          : {};
      const detail = [args.path, args.file_path, args.command].find(
        (value): value is string => typeof value === 'string',
      );
      return detail ? `${event.tool}: ${detail.slice(0, 120)}` : event.tool;
    }
    case 'error':
      return `Error: ${event.message.slice(0, 200)}`;
    default:
      return null;
  }
}

async function readOutput(dir: string, name: string): Promise<string | null> {
  const path = join(dir, name);
  try {
    if ((await stat(path)).size > MAX_OUTPUT_BYTES) return null;
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Drafts task suites from a plain-language description by running Hermes
 * itself. The agent gets the suite JSON Schema, an example and an authoring
 * skill, writes the suite plus a reference solution, and HighEval checks both:
 * the suite must pass the schema and every deterministic scorer must pass
 * against the reference. Problems go back to the agent for another attempt.
 * Drafts are never saved automatically; a person reviews them in the editor.
 */
@Injectable()
export class SuiteAssistantService implements OnModuleDestroy {
  private readonly logger = new Logger(SuiteAssistantService.name);
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly executor: AgentExecutor,
    private readonly config: ConfigService<Env, true>,
    private readonly credentials: ProviderCredentials,
  ) {}

  start(input: SuiteDraftData): SuiteDraft {
    const model = {
      provider: this.config.get('ASSISTANT_PROVIDER', { infer: true }),
      model: this.config.get('ASSISTANT_MODEL', { infer: true }),
    };
    if (!this.credentials.key(model.provider)) {
      const provider = PROVIDERS[model.provider];
      throw validationError([
        {
          path: 'description',
          message: `The assistant runs on ${provider.name}, which has no API key. Add one in Settings or set ${provider.keyEnvVar} in .env.`,
        },
      ]);
    }
    const draft: SuiteDraft = {
      id: newId(),
      status: 'running',
      description: input.description,
      revision: input.suite !== undefined,
      model,
      attempt: 1,
      maxAttempts: MAX_DRAFT_ATTEMPTS,
      activity: [],
      suite: null,
      checks: [],
      error: null,
      createdAt: nowIso(),
      finishedAt: null,
    };
    const job: Job = { draft, controller: new AbortController() };
    this.jobs.set(draft.id, job);
    void this.prune();
    void this.run(job, input).catch((error: unknown) => {
      this.logger.error(`Draft ${draft.id} failed unexpectedly`, error);
      this.finish(job, 'failed', error instanceof Error ? error.message : String(error));
    });
    return structuredClone(draft);
  }

  get(id: string): SuiteDraft {
    return structuredClone(this.job(id).draft);
  }

  cancel(id: string): SuiteDraft {
    const job = this.job(id);
    if (job.draft.status === 'running') {
      job.controller.abort();
      this.finish(job, 'cancelled', null);
    }
    return structuredClone(job.draft);
  }

  onModuleDestroy(): void {
    for (const job of this.jobs.values()) job.controller.abort();
  }

  private job(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`Draft ${id} not found`);
    return job;
  }

  private draftDir(id: string): string {
    return join(this.config.get('DATA_DIR', { infer: true }), 'drafts', id);
  }

  private async run(job: Job, input: SuiteDraftData): Promise<void> {
    const { draft, controller } = job;
    const snapshot = this.snapshot(draft);
    let previous: { suite: string | null; problems: string[] } | null = null;

    for (let attempt = 1; attempt <= MAX_DRAFT_ATTEMPTS; attempt++) {
      draft.attempt = attempt;
      this.note(draft, `Attempt ${String(attempt)} of ${String(MAX_DRAFT_ATTEMPTS)} started`);
      const outcome = await this.executor.execute(
        {
          runId: `draft-${draft.id}-${String(attempt)}`,
          prompt: prompt(input, previous),
          fixtures: fixtures(input, previous),
          config: snapshot,
          runDir: join(this.draftDir(draft.id), `attempt-${String(attempt)}`),
          // Drafting is interactive, so it takes the fastest provider rather than the cheapest.
          providerSort: 'throughput',
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            const text = describeEvent(event);
            if (text) this.note(draft, text, event.at);
          },
        },
      );
      if (draft.status !== 'running') return; // Cancelled while Hermes was running.
      if (outcome.kind === 'cancelled') return this.finish(job, 'cancelled', null);
      if (outcome.kind === 'errored') {
        if (outcome.retryable && attempt < MAX_DRAFT_ATTEMPTS) continue;
        return this.finish(job, draft.suite ? 'ready' : 'failed', outcome.errorMessage);
      }

      const suiteText = await readOutput(outcome.workspaceDir, 'suite.json');
      const review = await reviewDraft(
        suiteText,
        await readOutput(outcome.workspaceDir, 'reference.json'),
      );
      if (review.suite) {
        draft.suite = review.suite;
        draft.checks = review.checks;
      }
      if (review.problems.length === 0) return this.finish(job, 'ready', null);
      this.note(
        draft,
        `${String(review.problems.length)} problem(s) found; ${attempt < MAX_DRAFT_ATTEMPTS ? 'asking the agent to fix them' : 'no attempts left'}`,
      );
      previous = { suite: suiteText, problems: review.problems };
    }
    this.finish(
      job,
      draft.suite ? 'ready' : 'failed',
      draft.suite
        ? null
        : `No valid suite after ${String(MAX_DRAFT_ATTEMPTS)} attempts. Last problems: ${previous?.problems.slice(0, 3).join(' ') ?? 'unknown'}`,
    );
  }

  private snapshot(draft: SuiteDraft): ConfigSnapshot {
    const settings = {
      id: 'suite-assistant',
      name: 'Suite assistant',
      description: 'Drafts HighEval suites from a description.',
      model: draft.model,
      skills: [SUITE_AUTHORING_SKILL],
      memory: { mode: 'disabled' as const },
      soul: null,
      instructions: null,
      // The terminal lets the agent compute expected values with a script instead of guessing.
      toolsets: ['file' as const, 'terminal' as const],
      maxTurns: 40,
      timeoutSeconds: 600,
    };
    return { ...settings, hash: sha256Hex(settings) };
  }

  private note(draft: SuiteDraft, text: string, at = nowIso()): void {
    draft.activity = [...draft.activity, { at, text }].slice(-MAX_ACTIVITY);
  }

  private finish(job: Job, status: SuiteDraft['status'], error: string | null): void {
    job.draft.status = status;
    job.draft.error = error;
    job.draft.finishedAt = nowIso();
  }

  private async prune(): Promise<void> {
    const finished = [...this.jobs.values()].filter((job) => job.draft.status !== 'running');
    const excess = this.jobs.size - MAX_KEPT_DRAFTS;
    for (const job of finished.slice(0, Math.max(0, excess))) {
      this.jobs.delete(job.draft.id);
      await rm(this.draftDir(job.draft.id), { recursive: true, force: true });
    }
  }
}

function prompt(input: SuiteDraftData, previous: { problems: string[] } | null): string {
  return [
    'You are writing an evaluation suite for HighEval. Follow the suite-authoring skill.',
    input.suite
      ? 'Read request.md for the change the user wants, and current-suite.json for the suite to revise. Keep what the request does not ask to change.'
      : 'Read request.md for what the user wants the suite to test.',
    'suite.schema.json is the JSON Schema a suite must satisfy; example-suite.json shows two good tasks.',
    '',
    'Write two files in the current directory:',
    '1. suite.json: the suite, valid against suite.schema.json.',
    '2. reference.json: for every task key, what a perfect agent would leave behind, as {"<task key>": {"files": {"<path>": "<file content>"}, "output": "<final reply>"}}.',
    ...(previous
      ? [
          '',
          'A previous attempt is in previous-suite.json and problems.md lists what is wrong with it. Fix every problem; keep what is right.',
        ]
      : []),
    '',
    'Calculate expected values with a script in the terminal. When both files are written, reply with one line: DONE.',
  ].join('\n');
}

function fixtures(
  input: SuiteDraftData,
  previous: { suite: string | null; problems: string[] } | null,
): FixtureFile[] {
  return [
    { path: 'request.md', content: `${input.description}\n` },
    { path: 'suite.schema.json', content: SUITE_JSON_SCHEMA },
    { path: 'example-suite.json', content: EXAMPLE_SUITE },
    ...(input.suite
      ? [{ path: 'current-suite.json', content: JSON.stringify(input.suite, null, 2) }]
      : []),
    ...(previous
      ? [
          { path: 'previous-suite.json', content: previous.suite ?? '(not written)' },
          {
            path: 'problems.md',
            content: previous.problems.map((problem) => `- ${problem}`).join('\n'),
          },
        ]
      : []),
  ];
}
