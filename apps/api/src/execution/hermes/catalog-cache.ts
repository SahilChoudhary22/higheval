import { constants } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Hermes' models.dev catalog cache (~5 MB), read at any age; fetched only when absent. */
const CATALOG_FILE = 'models_dev_cache.json';

/**
 * Shares one copy of Hermes' model catalog across runs. Without this, every
 * fresh HERMES_HOME downloads ~5 MB before the agent starts, and runs in the
 * same experiment could see different catalog snapshots. Copies use a
 * copy-on-write clone where the filesystem supports it (APFS, Btrfs).
 */
export class CatalogCache {
  constructor(private readonly sharedDir: string) {}

  /** Seeds a run's HERMES_HOME with the shared catalog, if one exists. */
  async seed(homeDir: string): Promise<void> {
    const shared = join(this.sharedDir, CATALOG_FILE);
    if (!(await exists(shared))) return;
    await copyFile(shared, join(homeDir, CATALOG_FILE), constants.COPYFILE_FICLONE);
  }

  /** Keeps the catalog a run downloaded, so later runs can reuse it. */
  async capture(homeDir: string): Promise<void> {
    const shared = join(this.sharedDir, CATALOG_FILE);
    const fresh = join(homeDir, CATALOG_FILE);
    if ((await exists(shared)) || !(await exists(fresh))) return;
    await mkdir(dirname(shared), { recursive: true });
    await copyFile(fresh, shared, constants.COPYFILE_FICLONE);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}
