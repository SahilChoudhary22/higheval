import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const MAX_READ_BYTES = 1_000_000;
const MAX_LISTED_FILES = 200;

/**
 * Read-only view of a finished run's working directory. Guards against paths
 * (or symlinks planted by the agent) that resolve outside the directory.
 */
export class Workspace {
  private readonly root: string;

  constructor(directory: string) {
    this.root = realpathSync(directory);
  }

  readFile(path: string): string | null {
    try {
      const target = realpathSync(resolve(this.root, path));
      if (!this.contains(target)) return null;
      const stats = statSync(target);
      if (!stats.isFile() || stats.size > MAX_READ_BYTES) return null;
      return readFileSync(target, 'utf8');
    } catch {
      return null;
    }
  }

  listFiles(): { path: string; bytes: number }[] {
    const files: { path: string; bytes: number }[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (files.length >= MAX_LISTED_FILES) return;
        const absolute = join(directory, entry.name);
        // The executor initializes a git repo to stop context-file discovery; not agent output.
        if (entry.isDirectory()) {
          if (entry.name !== '.git') walk(absolute);
        } else if (entry.isFile()) {
          files.push({ path: relative(this.root, absolute), bytes: statSync(absolute).size });
        }
      }
    };
    walk(this.root);
    return files.toSorted((a, b) => a.path.localeCompare(b.path));
  }

  private contains(target: string): boolean {
    return target === this.root || target.startsWith(this.root + sep);
  }
}
