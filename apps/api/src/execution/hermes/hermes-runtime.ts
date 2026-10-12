import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const manifestSchema = z.object({
  commit: z.string(),
  repo: z.string(),
  python: z.string(),
  runtimeDir: z.string(),
  version: z.string(),
});

/** Installed Hermes, as recorded by scripts/setup-hermes.sh. */
export type HermesRuntime = z.infer<typeof manifestSchema>;

export const HERMES_NOT_INSTALLED = 'Hermes is not installed. Run `pnpm setup:hermes`.';

export function loadHermesRuntime(manifestPath: string): HermesRuntime | null {
  try {
    return manifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Command that starts Hermes' CLI directly from its venv, skipping the
 * wrapper's per-call dependency verification. The checkout must come first on
 * sys.path so the pinned source (not the venv's editable snapshot) is used.
 */
export function hermesCommand(runtime: HermesRuntime): { command: string; prefixArgs: string[] } {
  const bootstrap = [
    'import sys',
    `sys.path.insert(0, ${JSON.stringify(runtime.repo)})`,
    'import hermes_bootstrap',
    'from hermes_cli.main import main',
    'sys.exit(main())',
  ].join('; ');
  return { command: runtime.python, prefixArgs: ['-I', '-c', bootstrap] };
}

/** Hermes' built-in skills in the pinned checkout, as `<category>/<name>/SKILL.md`. */
export function bundledSkillsDir(runtime: HermesRuntime): string {
  return join(runtime.repo, 'skills');
}
