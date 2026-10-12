import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from './workspace.js';

describe('Workspace', () => {
  let base: string;
  let root: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'higheval-ws-'));
    root = join(base, 'work');
    mkdirSync(join(root, 'out'), { recursive: true });
    writeFileSync(join(root, 'out', 'result.json'), '{"ok":true}');
    writeFileSync(join(base, 'secret.txt'), 'expected answers');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('reads files inside the workspace', () => {
    expect(new Workspace(root).readFile('out/result.json')).toBe('{"ok":true}');
  });

  it('returns null for missing files and traversal attempts', () => {
    const workspace = new Workspace(root);
    expect(workspace.readFile('missing.txt')).toBeNull();
    expect(workspace.readFile('../secret.txt')).toBeNull();
  });

  it('does not follow symlinks that escape the workspace', () => {
    symlinkSync(join(base, 'secret.txt'), join(root, 'link.txt'));
    expect(new Workspace(root).readFile('link.txt')).toBeNull();
  });

  it('lists files recursively with sizes', () => {
    expect(new Workspace(root).listFiles()).toEqual([{ path: 'out/result.json', bytes: 11 }]);
  });
});
