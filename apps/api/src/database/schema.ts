import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import type {
  AgentEvent,
  BundledSkills,
  ConfigSnapshot,
  FixtureFile,
  JudgeDetails,
  MemorySettings,
  ScorerSpec,
  Task,
  TokenUsage,
} from '@higheval/shared';
import {
  ARMS,
  EXPERIMENT_STATUSES,
  RUN_ERROR_KINDS,
  RUN_STATUSES,
  TERMINATIONS,
  type Toolset,
} from '@higheval/shared';

/** All timestamps are ISO-8601 strings in UTC. */
const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  content: text('content').notNull(),
  ...timestamps,
});

export const suites = sqliteTable('suites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  ...timestamps,
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    suiteId: text('suite_id')
      .notNull()
      .references((): AnySQLiteColumn => suites.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    fixtures: text('fixtures', { mode: 'json' }).$type<FixtureFile[]>().notNull(),
    scorers: text('scorers', { mode: 'json' }).$type<ScorerSpec[]>().notNull(),
    passThreshold: real('pass_threshold').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (table) => [uniqueIndex('tasks_suite_key_idx').on(table.suiteId, table.key)],
);

export const agentConfigs = sqliteTable('agent_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  provider: text('provider', { enum: ['openrouter'] }).notNull(),
  model: text('model').notNull(),
  skillIds: text('skill_ids', { mode: 'json' }).$type<string[]>().notNull(),
  memory: text('memory', { mode: 'json' }).$type<MemorySettings>().notNull(),
  toolsets: text('toolsets', { mode: 'json' }).$type<Toolset[]>().notNull(),
  bundledSkills: text('bundled_skills', { mode: 'json' })
    .$type<BundledSkills>()
    .notNull()
    .default(sql`'{"mode":"none"}'`),
  maxTurns: integer('max_turns').notNull(),
  timeoutSeconds: integer('timeout_seconds').notNull(),
  ...timestamps,
});

/**
 * Experiments are self-contained: suite tasks and both configurations are
 * snapshotted at launch, so editing or deleting definitions later cannot
 * change what an experiment measured.
 */
export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  suiteId: text('suite_id').notNull(),
  suiteName: text('suite_name').notNull(),
  suiteHash: text('suite_hash').notNull(),
  tasks: text('tasks', { mode: 'json' }).$type<Task[]>().notNull(),
  baseline: text('baseline', { mode: 'json' }).$type<ConfigSnapshot>().notNull(),
  candidate: text('candidate', { mode: 'json' }).$type<ConfigSnapshot>().notNull(),
  repetitions: integer('repetitions').notNull(),
  practicalMargin: real('practical_margin').notNull(),
  seed: integer('seed').notNull(),
  status: text('status', { enum: EXPERIMENT_STATUSES }).notNull(),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
});

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    experimentId: text('experiment_id')
      .notNull()
      .references((): AnySQLiteColumn => experiments.id, { onDelete: 'cascade' }),
    arm: text('arm', { enum: ARMS }).notNull(),
    taskId: text('task_id').notNull(),
    taskKey: text('task_key').notNull(),
    repetition: integer('repetition').notNull(),
    /** Execution order; randomized per experiment to spread provider drift across arms. */
    sequence: integer('sequence').notNull(),
    status: text('status', { enum: RUN_STATUSES }).notNull(),
    termination: text('termination', { enum: TERMINATIONS }),
    errorKind: text('error_kind', { enum: RUN_ERROR_KINDS }),
    errorMessage: text('error_message'),
    score: real('score'),
    passed: integer('passed', { mode: 'boolean' }),
    durationMs: integer('duration_ms'),
    tokens: text('tokens', { mode: 'json' }).$type<TokenUsage>(),
    toolCalls: integer('tool_calls').notNull().default(0),
    apiCalls: integer('api_calls'),
    costUsd: real('cost_usd'),
    /** LLM-judge usage for scoring this run, kept separate from the agent's. */
    judgeRequests: integer('judge_requests').notNull().default(0),
    judgeTokens: integer('judge_tokens').notNull().default(0),
    judgeCostUsd: real('judge_cost_usd'),
    attempts: integer('attempts').notNull().default(0),
    /** Earliest time a retried run may start again (retry backoff). */
    notBefore: text('not_before'),
    exitCode: integer('exit_code'),
    finalOutput: text('final_output'),
    reportedModel: text('reported_model'),
    sessionId: text('session_id'),
    stderrTail: text('stderr_tail'),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (table) => [
    index('runs_experiment_status_idx').on(table.experimentId, table.status),
    index('runs_experiment_sequence_idx').on(table.experimentId, table.sequence),
  ],
);

export const runEvents = sqliteTable(
  'run_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references((): AnySQLiteColumn => runs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    event: text('event', { mode: 'json' }).$type<AgentEvent>().notNull(),
  },
  (table) => [index('run_events_run_sequence_idx').on(table.runId, table.sequence)],
);

export const runScores = sqliteTable(
  'run_scores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references((): AnySQLiteColumn => runs.id, { onDelete: 'cascade' }),
    scorerIndex: integer('scorer_index').notNull(),
    type: text('type').notNull(),
    label: text('label').notNull(),
    weight: real('weight').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    score: real('score').notNull(),
    reason: text('reason').notNull(),
    /** Per-criterion evidence for LLM-judge scorers; null for deterministic ones. */
    details: text('details', { mode: 'json' }).$type<JudgeDetails>(),
  },
  (table) => [index('run_scores_run_idx').on(table.runId)],
);
