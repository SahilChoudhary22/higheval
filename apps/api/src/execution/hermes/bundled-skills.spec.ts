import type { ResolvedBundledSkills } from '@higheval/shared';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  NO_BUNDLED_SKILLS,
  resolveBundledSkills,
  scanBundledSkills,
  type BundledSkillScan,
  type ScannedBundledSkill,
} from './bundled-skills.js';

const skill = (frontmatter: string, body = '# Skill\n'): string =>
  `---\n${frontmatter}\n---\n\n${body}`;

describe('scanBundledSkills', () => {
  let root: string;

  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const hashOf = (name: string): string | undefined =>
    scanBundledSkills(root).skills.find((entry) => entry.name === name)?.contentHash;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'higheval-bundled-'));
    write('productivity/DESCRIPTION.md', '---\ndescription: Office work.\n---\n');
    write(
      'productivity/notes/SKILL.md',
      skill(
        'name: notes\ndescription: "Turn notes into tasks."\nplatforms: [linux, macos, windows]\nmetadata:\n  hermes:\n    tags: [Notes]',
      ),
    );
    write('productivity/notes/scripts/extract.py', 'print("hi")\n');
    write(
      'apple/reminders/SKILL.md',
      skill('name: reminders\ndescription: Apple.\nplatforms: macos'),
    );
    write('apple/unnamed/SKILL.md', skill('description: Falls back to its directory.'));
    write('apple/broken/SKILL.md', skill('name: [unclosed'));
    write('apple/Bad Name/SKILL.md', skill('description: Not a slug.'));
    write('apple/not-a-skill/README.md', 'no SKILL.md here');
    write('index-cache/hub.json', '{}');
    write('AGENTS.md', '# Authoring guide');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists skills by name with their category, description and platforms', () => {
    const scan = scanBundledSkills(root);
    expect(
      scan.skills.map(({ name, category, description, platforms, path }) => ({
        name,
        category,
        description,
        platforms,
        path,
      })),
    ).toEqual([
      {
        name: 'notes',
        category: 'productivity',
        description: 'Turn notes into tasks.',
        platforms: ['linux', 'macos', 'windows'],
        path: 'productivity/notes',
      },
      {
        name: 'reminders',
        category: 'apple',
        description: 'Apple.',
        platforms: ['macos'],
        path: 'apple/reminders',
      },
      {
        name: 'unnamed',
        category: 'apple',
        description: 'Falls back to its directory.',
        platforms: [],
        path: 'apple/unnamed',
      },
    ]);
  });

  it('reports unreadable skills instead of failing the whole catalog', () => {
    const skipped = scanBundledSkills(root).skipped.map(({ path }) => path);
    expect(skipped.toSorted()).toEqual(['apple/Bad Name', 'apple/broken']);
  });

  it('records category descriptions that exist', () => {
    const { categoryFiles } = scanBundledSkills(root);
    expect([...categoryFiles.keys()]).toEqual(['productivity']);
    expect(categoryFiles.get('productivity')?.path).toBe('productivity/DESCRIPTION.md');
  });

  it('hashes every file in a skill directory, including supporting files', () => {
    const before = hashOf('notes');
    expect(before).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf('notes')).toBe(before);

    write('productivity/notes/scripts/extract.py', 'print("changed")\n');
    expect(hashOf('notes')).not.toBe(before);
  });
});

const entry = (category: string, name: string, contentHash = name): ScannedBundledSkill => ({
  name,
  category,
  description: '',
  platforms: [],
  path: `${category}/${name}`,
  contentHash,
});
const scanOf = (skills: ScannedBundledSkill[]): BundledSkillScan => ({
  skills,
  categoryFiles: new Map([
    ['research', { path: 'research/DESCRIPTION.md', contentHash: 'research-blurb' }],
  ]),
  skipped: [],
});
const resolved = (result: ReturnType<typeof resolveBundledSkills>): ResolvedBundledSkills => {
  if (!result.ok) throw new Error(`Unexpected unknown skills: ${JSON.stringify(result.unknown)}`);
  return result.resolved;
};
const selectionHash = (source: BundledSkillScan, names: string[]): string | null =>
  resolved(resolveBundledSkills(source, { mode: 'selected', names })).contentHash;

describe('resolveBundledSkills', () => {
  const scan = scanOf([entry('productivity', 'notes'), entry('research', 'arxiv')]);

  it('copies nothing for "none"', () => {
    expect(resolveBundledSkills(scan, { mode: 'none' })).toEqual({
      ok: true,
      resolved: NO_BUNDLED_SKILLS,
    });
  });

  it('copies the selected skills with their category descriptions', () => {
    expect(resolved(resolveBundledSkills(scan, { mode: 'selected', names: ['arxiv'] }))).toEqual({
      mode: 'selected',
      names: ['arxiv'],
      paths: ['research/DESCRIPTION.md', 'research/arxiv'],
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
  });

  it('copies every skill for "all"', () => {
    const all = resolved(resolveBundledSkills(scan, { mode: 'all' }));
    expect(all.names).toEqual(['notes', 'arxiv']);
    expect(all.paths).toEqual(['productivity/notes', 'research/DESCRIPTION.md', 'research/arxiv']);
  });

  it('hashes what is copied: the selection and the file contents', () => {
    const arxiv = selectionHash(scan, ['arxiv']);
    expect(selectionHash(scan, ['arxiv'])).toBe(arxiv);
    expect(selectionHash(scan, ['arxiv', 'notes'])).not.toBe(arxiv);
    expect(selectionHash(scanOf([entry('research', 'arxiv', 'edited')]), ['arxiv'])).not.toBe(
      arxiv,
    );
  });

  it('reports names the catalog does not have, by position', () => {
    expect(resolveBundledSkills(scan, { mode: 'selected', names: ['arxiv', 'imaginary'] })).toEqual(
      { ok: false, unknown: [{ index: 1, name: 'imaginary' }] },
    );
  });
});
