import { ConfigService } from '@nestjs/config';
import { bundledSkillCatalogSchema } from '@higheval/shared';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BundledSkillsService } from './bundled-skills.service.js';

describe('BundledSkillsService', () => {
  let root: string;
  let manifest: string;

  const install = (commit: string): void => {
    writeFileSync(
      manifest,
      JSON.stringify({ commit, repo: root, python: '/p', runtimeDir: '/rt', version: 'Hermes' }),
    );
  };
  const addSkill = (category: string, name: string): void => {
    mkdirSync(join(root, 'skills', category, name), { recursive: true });
    writeFileSync(
      join(root, 'skills', category, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${name} skill.\nplatforms: [linux, macos]\n---\n`,
    );
  };
  const service = (): BundledSkillsService =>
    new BundledSkillsService(new ConfigService({ HERMES_MANIFEST: manifest }));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'higheval-hermes-'));
    manifest = join(root, 'manifest.json');
    addSkill('research', 'arxiv');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('says Hermes is unavailable, with no skills, when it is not installed', () => {
    const catalog = bundledSkillCatalogSchema.parse(service().catalog());
    expect(catalog).toMatchObject({ status: 'unavailable', skills: [] });
    expect(catalog.status === 'unavailable' && catalog.message).toContain('setup:hermes');
  });

  it('lists the installed commit and its skills', () => {
    install('abc123');
    expect(bundledSkillCatalogSchema.parse(service().catalog())).toEqual({
      status: 'available',
      hermesCommit: 'abc123',
      skills: [
        {
          name: 'arxiv',
          category: 'research',
          description: 'arxiv skill.',
          platforms: ['linux', 'macos'],
        },
      ],
    });
  });

  it('rescans when a different Hermes commit is installed, listing by category', () => {
    install('abc123');
    const catalogs = service();
    expect(catalogs.catalog().skills).toHaveLength(1);

    addSkill('ai', 'zeta');
    expect(catalogs.catalog().skills).toHaveLength(1);
    install('def456');
    expect(catalogs.catalog().skills.map((skill) => skill.name)).toEqual(['zeta', 'arxiv']);
  });
});
