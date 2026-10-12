import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs before each e2e file is imported. ConfigModule reads the environment
// when AppModule is imported, so isolation must be configured here, not in
// beforeAll. Each file gets its own data directory and SQLite database.
const dataDir = mkdtempSync(join(tmpdir(), 'higheval-e2e-'));
process.env.DATA_DIR = dataDir;
process.env.RETRY_BASE_DELAY_MS = '0';
process.env.SEED_SAMPLES = 'false';

// A stand-in Hermes install with two built-in skills, so the skill catalog does
// not depend on whether the real runtime is installed. Nothing is ever executed.
const hermesRepo = join(dataDir, 'hermes');
for (const [category, name] of [
  ['research', 'arxiv'],
  ['apple', 'apple-notes'],
] as const) {
  mkdirSync(join(hermesRepo, 'skills', category, name), { recursive: true });
  writeFileSync(
    join(hermesRepo, 'skills', category, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: The ${name} skill.\nplatforms: [${category === 'apple' ? 'macos' : 'linux, macos, windows'}]\n---\n\n# ${name}\n`,
  );
}
const manifest = join(dataDir, 'hermes-manifest.json');
writeFileSync(
  manifest,
  JSON.stringify({
    commit: 'e2e0000',
    repo: hermesRepo,
    python: join(dataDir, 'no-python'),
    runtimeDir: join(dataDir, 'hermes-runtime'),
    version: 'Hermes e2e',
  }),
);
process.env.HERMES_MANIFEST = manifest;

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
