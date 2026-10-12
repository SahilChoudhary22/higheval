import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROVIDERS, type AgentEvent } from '@higheval/shared';
import { execFile } from 'node:child_process';
import { constants, createWriteStream } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Env } from '../../config/env.schema.js';
import {
  AgentExecutor,
  WORKSPACE_DIRNAME,
  type ExecutionHooks,
  type ExecutionOutcome,
  type ExecutionRequest,
} from '../agent-executor.js';
import { ProviderCredentials } from '../../providers/provider-credentials.service.js';
import { CatalogCache } from './catalog-cache.js';
import {
  bundledSkillsDir,
  HERMES_NOT_INSTALLED,
  hermesCommand,
  loadHermesRuntime,
} from './hermes-runtime.js';
import { HermesStreamParser, type HermesResult } from './hermes-stream-parser.js';
import { runProcess } from './process.js';
import { classifyHermesExit } from './run-classification.js';
import { buildRunPlan, type RunPlan } from './run-plan.js';
import { readSessionStats } from './session-stats.js';

const STDERR_TAIL_BYTES = 8_000;
/** Hermes' --run-budget is advisory; we SIGTERM this long after it elapses. */
const HARD_TIMEOUT_GRACE_MS = 15_000;

const execFileAsync = promisify(execFile);

/**
 * Runs one task through the Hermes CLI in a fresh, isolated environment:
 *
 *   <runDir>/home     HERMES_HOME with only this config's settings, skills (its own
 *                     and the built-in ones it selected) and memory
 *   <runDir>/oshome   throwaway HOME so Hermes never touches the real profile
 *   <runDir>/work     the agent's working directory (task fixtures, outputs)
 *
 * The raw JSONL stream and stderr are kept next to them as evidence.
 */
@Injectable()
export class HermesExecutor extends AgentExecutor {
  private readonly logger = new Logger(HermesExecutor.name);
  private readonly catalog: CatalogCache;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly credentials: ProviderCredentials,
  ) {
    super();
    this.catalog = new CatalogCache(join(config.get('DATA_DIR', { infer: true }), 'hermes-cache'));
  }

  async execute(request: ExecutionRequest, hooks: ExecutionHooks): Promise<ExecutionOutcome> {
    const startedAt = Date.now();
    const elapsed = (): number => Date.now() - startedAt;
    const runtime = loadHermesRuntime(this.config.get('HERMES_MANIFEST', { infer: true }));
    const provider = PROVIDERS[request.config.model.provider];
    const apiKey = this.credentials.key(provider.id);
    if (!runtime) return setupError(HERMES_NOT_INSTALLED, elapsed());
    if (!apiKey) {
      return setupError(
        `No API key for ${provider.name}. Add one in Settings, or set ${provider.keyEnvVar} in .env.`,
        elapsed(),
      );
    }

    const launchedWith = request.config.hermesCommit;
    if (launchedWith !== undefined && launchedWith !== runtime.commit) {
      // The snapshot (and its built-in skill hashes) describes a different Hermes.
      return setupError(
        `Hermes changed since this experiment was launched (${launchedWith.slice(0, 7)} → ${runtime.commit.slice(0, 7)}); relaunch it to compare like with like.`,
        elapsed(),
      );
    }

    const dirs = {
      home: join(request.runDir, 'home'),
      osHome: join(request.runDir, 'oshome'),
      work: join(request.runDir, WORKSPACE_DIRNAME),
    };
    const promptFile = join(request.runDir, 'prompt.md');
    const plan = buildRunPlan(
      request.config,
      { promptFile, workDir: dirs.work },
      request.providerSort,
    );
    await this.prepareRunDir(request, dirs, promptFile, plan, bundledSkillsDir(runtime));

    const { command, prefixArgs } = hermesCommand(runtime);
    const parser = new HermesStreamParser();
    let result: HermesResult | null = null;
    let reportedModel: string | null = null;
    let streamedText = '';
    let stderrTail = '';
    const stdoutLog = createWriteStream(join(request.runDir, 'stdout.jsonl'));
    const stderrLog = createWriteStream(join(request.runDir, 'stderr.log'));
    // Evidence logs are best effort: a full disk must not crash the API.
    for (const log of [stdoutLog, stderrLog]) {
      log.on('error', (error) => this.logger.warn(`Could not write run log: ${error.message}`));
    }

    const consume = (parsed: ReturnType<HermesStreamParser['push']>): void => {
      result ??= parsed.result;
      for (const event of parsed.events) {
        if (event.type === 'session') reportedModel = event.model;
        if (event.type === 'text') streamedText += event.text;
        hooks.onEvent(event);
      }
    };

    const processResult = await runProcess(
      {
        command,
        args: [...prefixArgs, ...plan.args],
        cwd: dirs.work,
        // Built from scratch: no inherited secrets or HERMES_* overrides from the host.
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          LANG: 'en_US.UTF-8',
          HOME: dirs.osHome,
          HERMES_HOME: dirs.home,
          HERMES_RUNTIME_DIR: runtime.runtimeDir,
          // Points at a directory that does not exist, so Hermes seeds no bundled
          // skills itself; the ones the snapshot selected were copied in.
          HERMES_BUNDLED_SKILLS: join(request.runDir, 'no-bundled-skills'),
          HERMES_DISABLE_LAZY_INSTALLS: '1',
          HERMES_TIMEZONE: 'UTC',
          // Only the key for this run's provider, under the name Hermes reads.
          [provider.keyEnvVar]: apiKey,
        },
      },
      {
        onStdout: (chunk) => {
          stdoutLog.write(chunk);
          consume(parser.push(chunk));
        },
        onStderr: (chunk) => {
          stderrLog.write(chunk);
          stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
        },
      },
      {
        signal: hooks.signal,
        hardTimeoutMs: request.config.timeoutSeconds * 1_000 + HARD_TIMEOUT_GRACE_MS,
      },
    );
    consume(parser.end());
    await Promise.all([closeStream(stdoutLog), closeStream(stderrLog)]);

    await this.catalog.capture(dirs.home).catch((error: unknown) => {
      this.logger.warn(`Could not cache the model catalog: ${String(error)}`);
    });
    const finalResult = result as HermesResult | null;
    const stats = readSessionStats(join(dirs.home, 'state.db'), finalResult?.sessionId ?? null);
    const common = {
      durationMs: elapsed(),
      exitCode: processResult.exitCode,
      stderrTail: stderrTail || null,
      tokens: finalResult?.tokens ?? null,
      reportedModel: stats.model ?? reportedModel,
      sessionId: finalResult?.sessionId ?? null,
      apiCalls: stats.apiCalls,
      costUsd: stats.costUsd,
    };
    const finalOutput = finalResult?.text || streamedText || null;

    if (processResult.stoppedBy === 'abort') return { ...common, kind: 'cancelled' };
    if (processResult.spawnError) {
      return {
        ...common,
        kind: 'errored',
        errorKind: 'setup',
        errorMessage: processResult.spawnError.message,
        retryable: false,
      };
    }
    if (processResult.stoppedBy === 'timeout') {
      hooks.onEvent(
        errorEvent(
          `Run exceeded its ${String(request.config.timeoutSeconds)}s budget and was stopped`,
        ),
      );
      return {
        ...common,
        kind: 'completed',
        termination: 'timeout',
        finalOutput,
        workspaceDir: dirs.work,
      };
    }

    const classification = classifyHermesExit(finalResult, stderrTail);
    switch (classification.kind) {
      case 'completed':
        return {
          ...common,
          kind: 'completed',
          termination: 'completed',
          finalOutput,
          workspaceDir: dirs.work,
        };
      case 'incomplete': {
        // Hermes makes one extra summary request after exhausting its turns.
        const hitTurnLimit = (stats.apiCalls ?? 0) >= request.config.maxTurns;
        return {
          ...common,
          kind: 'completed',
          termination: hitTurnLimit ? 'max_turns' : 'completed',
          finalOutput,
          workspaceDir: dirs.work,
        };
      }
      case 'provider':
        return {
          ...common,
          kind: 'errored',
          errorKind: 'provider',
          errorMessage: classification.message,
          retryable: classification.retryable,
        };
      case 'crash':
        return {
          ...common,
          kind: 'errored',
          errorKind: 'crash',
          errorMessage: classification.message,
          retryable: false,
        };
    }
  }

  private async prepareRunDir(
    request: ExecutionRequest,
    dirs: { home: string; osHome: string; work: string },
    promptFile: string,
    plan: RunPlan,
    bundledSkillsRoot: string,
  ): Promise<void> {
    await Promise.all(Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })));
    await writeFile(promptFile, request.prompt);
    await writeFiles(dirs.home, plan.homeFiles);
    await copyBundledSkills(bundledSkillsRoot, dirs.home, plan.bundledSkillPaths);
    await this.catalog.seed(dirs.home);
    await writeFiles(dirs.work, {
      ...Object.fromEntries(request.fixtures.map((file) => [file.path, file.content])),
      // The agent's own files (its AGENTS.md); launch refuses tasks whose fixtures would clash.
      ...plan.workFiles,
    });
    // A git root at the workspace stops Hermes from walking up into this
    // repository for AGENTS.md / .hermes.md context files.
    try {
      await execFileAsync('git', ['init', '-q'], { cwd: dirs.work });
    } catch (error) {
      this.logger.warn(`git init failed for run ${request.runId}: ${String(error)}`);
    }
  }
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Copies built-in skills verbatim (cloned copy-on-write where the filesystem allows). */
async function copyBundledSkills(
  sourceRoot: string,
  homeDir: string,
  paths: readonly string[],
): Promise<void> {
  for (const path of paths) {
    await cp(join(sourceRoot, path), join(homeDir, 'skills', path), {
      recursive: true,
      errorOnExist: true,
      force: false,
      mode: constants.COPYFILE_FICLONE,
    });
  }
}

function closeStream(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => stream.end(resolve));
}

function errorEvent(message: string): AgentEvent {
  return { type: 'error', at: new Date().toISOString(), message };
}

function setupError(message: string, durationMs: number): ExecutionOutcome {
  return {
    kind: 'errored',
    errorKind: 'setup',
    errorMessage: message,
    retryable: false,
    durationMs,
    exitCode: null,
    stderrTail: null,
    tokens: null,
    reportedModel: null,
    sessionId: null,
    apiCalls: null,
    costUsd: null,
  };
}
