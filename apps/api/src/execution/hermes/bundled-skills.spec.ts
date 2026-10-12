import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scanBundledSkills } from './bundled-skills.js';

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
