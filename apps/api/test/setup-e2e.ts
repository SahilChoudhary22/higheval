import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs before each e2e file is imported. ConfigModule reads the environment
// when AppModule is imported, so isolation must be configured here, not in
// beforeAll. Each file gets its own data directory and SQLite database.
const dataDir = mkdtempSync(join(tmpdir(), 'higheval-e2e-'));
process.env.DATA_DIR = dataDir;
process.env.RETRY_BASE_DELAY_MS = '0';
process.env.SEED_SAMPLES = 'false';

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});
