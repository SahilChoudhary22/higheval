import type { ConfigSnapshot, Toolset } from '@higheval/shared';
import type { ProviderSort } from '../agent-executor.js';

/** Reasoning effort is pinned so both arms send identical reasoning settings. */
export const REASONING_EFFORT = 'medium';

/** Hermes joins memory entries with this delimiter in MEMORY.md. */
const MEMORY_DELIMITER = '\n§\n';

export interface RunPlan {
  /** Files to write under the run's HERMES_HOME, keyed by relative path. */
  homeFiles: Record<string, string>;
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
  const seededMemory = config.memory.mode === 'seeded';
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
      memory_enabled: seededMemory,
      user_profile_enabled: false,
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
  if (config.memory.mode === 'seeded') {
    homeFiles['memories/MEMORY.md'] = config.memory.entries.join(MEMORY_DELIMITER);
  }

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

  return { homeFiles, bundledSkillPaths, args };
}
