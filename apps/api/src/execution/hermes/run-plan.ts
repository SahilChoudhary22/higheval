import type { ConfigSnapshot, Toolset } from '@higheval/shared';
import type { ProviderSort } from '../agent-executor.js';

/** Reasoning effort is pinned so both arms send identical reasoning settings. */
export const REASONING_EFFORT = 'medium';

/** Hermes joins memory entries with this delimiter in MEMORY.md and USER.md. */
const MEMORY_DELIMITER = '\n§\n';
const DEFAULT_MEMORY_CHARS = 2_200;
const DEFAULT_USER_CHARS = 1_375;

/** Where an agent's standing instructions go in the run's working directory. */
export const AGENT_INSTRUCTIONS_FILE = 'AGENTS.md';
/**
 * Files Hermes reads from the working directory as project instructions. The
 * first kind found wins, so a task fixture with any of these names would
 * replace or hide an agent's AGENTS.md.
 */
export const PROJECT_CONTEXT_FILES = [
  '.hermes.md',
  'HERMES.md',
  'AGENTS.override.md',
  'AGENTS.md',
  'agents.md',
  'CLAUDE.md',
  'claude.md',
  '.cursorrules',
] as const;

export interface RunPlan {
  /** Files to write under the run's HERMES_HOME, keyed by relative path. */
  homeFiles: Record<string, string>;
  /** Files to write into the agent's working directory, after the task's fixtures. */
  workFiles: Record<string, string>;
  /**
   * Paths under Hermes' bundled skills root to copy unchanged into the home's
   * `skills/` directory (skill directories and category descriptions).
   */
  bundledSkillPaths: string[];
  /** Arguments after the Hermes entry point. */
  args: string[];
}

/**
 * Translates a configuration snapshot into an isolated Hermes invocation.
 * Every setting that could leak state between runs or arms is pinned off:
 * unrecorded bundled skills and project skills, memory providers and
 * background review, coding-context injection of the host repo, OpenRouter
 * response caching, model fallbacks, lazy installs and update checks. Model and
 * provider are set in config rather than on the CLI, which would trigger an
 * interactive cost guard.
 *
 * Built-in skills the snapshot selected are copied in (Hermes' own seeding
 * stays disabled) and are found on demand through the `skills` toolset, which
 * is therefore always enabled alongside them. Snapshots from before built-in
 * skills were configurable have none.
 */
export function buildRunPlan(
  config: ConfigSnapshot,
  paths: { promptFile: string; workDir: string },
  providerSort: ProviderSort = 'price',
): RunPlan {
  const memory = config.memory.mode === 'seeded' ? config.memory : { entries: [], userProfile: [] };
  const memoryFile = memory.entries.join(MEMORY_DELIMITER);
  const userFile = memory.userProfile.join(MEMORY_DELIMITER);
  const bundledSkillPaths = config.bundledSkills?.paths ?? [];
  const toolsets: Toolset[] =
    bundledSkillPaths.length > 0
      ? [...new Set([...config.toolsets, 'skills' as const])]
      : config.toolsets;
  const hermesConfig = {
    model: { provider: config.model.provider, default: config.model.model },
    fallback_providers: [],
    openrouter: { response_cache: false },
    // OpenRouter serves most models through several providers at different
    // prices and speeds. Experiments take the cheapest, which also keeps the
    // provider fixed; other model providers ignore this setting.
    provider_routing: { sort: providerSort },
    // Used when --toolsets is omitted, which is how "no tools" is expressed.
    platform_toolsets: { cli: toolsets },
    timezone: 'UTC',
    agent: {
      max_turns: config.maxTurns,
      reasoning_effort: REASONING_EFFORT,
      coding_context: 'off',
      environment_probe: false,
      auto_recovery_cycles: 0,
      api_max_retries: 3,
    },
    memory: {
      memory_enabled: memoryFile.length > 0,
      user_profile_enabled: userFile.length > 0,
      // Hermes' defaults (2,200 and 1,375 characters) cap what the agent may add, not what it
      // loads; raising them to fit avoids warnings about seeded memory being "over the limit".
      memory_char_limit: Math.max(DEFAULT_MEMORY_CHARS, memoryFile.length),
      user_char_limit: Math.max(DEFAULT_USER_CHARS, userFile.length),
      provider: '',
      nudge_interval: 0,
    },
    auxiliary: {
      background_review: { enabled: false },
      title_generation: { enabled: false },
      compression: { provider: config.model.provider, model: config.model.model },
    },
    skills: { external_dirs: [], project_discovery: false, auto_load: [], inline_shell: false },
    curator: { enabled: false },
    approvals: { single_query_mode: 'deny' },
    terminal: { backend: 'local', cwd: '.', auto_source_bashrc: false },
    security: { allow_lazy_installs: false },
    updates: { check: false },
    lsp: { enabled: false },
    cli: { expose_on_path: false },
    onboarding: { profile_build: 'off' },
  };

  const homeFiles: Record<string, string> = {
    // JSON is valid YAML, so no YAML serializer is needed.
    'config.yaml': `${JSON.stringify(hermesConfig, null, 2)}\n`,
  };
  for (const skill of config.skills) {
    homeFiles[`skills/${skill.name}/SKILL.md`] =
      `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.content.trim()}\n`;
  }
  if (memoryFile) homeFiles['memories/MEMORY.md'] = memoryFile;
  if (userFile) homeFiles['memories/USER.md'] = userFile;
  // Without a SOUL.md, Hermes writes its built-in persona on first start.
  if (config.soul) homeFiles['SOUL.md'] = `${config.soul}\n`;

  // Hermes loads AGENTS.md from the working directory as standing instructions.
  const workFiles: Record<string, string> = config.instructions
    ? { [AGENT_INSTRUCTIONS_FILE]: `${config.instructions}\n` }
    : {};

  const args = [
    'chat',
    '--query-file',
    paths.promptFile,
    '--format',
    'stream-json',
    '--max-turns',
    String(config.maxTurns),
    '--run-budget',
    String(config.timeoutSeconds),
    '--in',
    paths.workDir,
    '--source',
    'tool',
  ];
  if (toolsets.length > 0) args.push('--toolsets', toolsets.join(','));
  if (config.skills.length > 0)
    args.push('--skills', config.skills.map((skill) => skill.name).join(','));

  return { homeFiles, workFiles, bundledSkillPaths, args };
}
