import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogCache } from './catalog-cache.js';

describe('CatalogCache', () => {
  let root: string;
  let cache: CatalogCache;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'higheval-catalog-'));
    cache = new CatalogCache(join(root, 'shared'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const home = (name: string): string => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  it('does nothing until a run has downloaded the catalog', async () => {
    const first = home('run-1');
    await cache.seed(first);
    expect(existsSync(join(first, 'models_dev_cache.json'))).toBe(false);
  });

  it('captures the first downloaded catalog and seeds later runs with it', async () => {
    const first = home('run-1');
    writeFileSync(join(first, 'models_dev_cache.json'), '{"v":1}');
    await cache.capture(first);

    const second = home('run-2');
    await cache.seed(second);
    expect(readFileSync(join(second, 'models_dev_cache.json'), 'utf8')).toBe('{"v":1}');
  });

  it('keeps the first snapshot so runs see a consistent catalog', async () => {
    const first = home('run-1');
    writeFileSync(join(first, 'models_dev_cache.json'), '{"v":1}');
    await cache.capture(first);
    const second = home('run-2');
    writeFileSync(join(second, 'models_dev_cache.json'), '{"v":2}');
    await cache.capture(second);

    const third = home('run-3');
    await cache.seed(third);
    expect(readFileSync(join(third, 'models_dev_cache.json'), 'utf8')).toBe('{"v":1}');
  });
});
