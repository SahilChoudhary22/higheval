import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { agentConfigInputSchema, type AgentConfigInput } from '@higheval/shared';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type OpenedDatabase } from '../database/database.js';
import { BundledSkillsService } from '../execution/hermes/bundled-skills.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { ConfigsService, type AgentConfigData } from './configs.service.js';

/** The response body of the 400 that `action` throws. */
function rejection(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    if (error instanceof BadRequestException) return error.getResponse();
    throw error;
  }
  throw new Error('Expected a 400');
}

const input = (overrides: Partial<AgentConfigInput> = {}): AgentConfigData =>
  agentConfigInputSchema.parse({
    name: 'Config',
    model: { provider: 'openrouter', model: 'vendor/model' },
    ...overrides,
  });

describe('ConfigsService and Hermes built-in skills', () => {
  let root: string;
  let database: OpenedDatabase;
  let skills: SkillsService;

  const service = (manifest: string): ConfigsService =>
    new ConfigsService(
      database.db,
      skills,
      new BundledSkillsService(new ConfigService({ HERMES_MANIFEST: manifest })),
    );

  let configs: ConfigsService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'higheval-configs-'));
    for (const [category, name] of [
      ['research', 'arxiv'],
      ['productivity', 'notes'],
    ] as const) {
      mkdirSync(join(root, 'hermes', 'skills', category, name), { recursive: true });
      writeFileSync(
        join(root, 'hermes', 'skills', category, name, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${name}.\n---\n`,
      );
    }
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({
        commit: 'abc1234',
        repo: join(root, 'hermes'),
        python: '/p',
        runtimeDir: '/rt',
        version: 'Hermes',
      }),
    );
    database = openDatabase(':memory:');
    skills = new SkillsService(database.db);
    configs = service(join(root, 'manifest.json'));
  });

  afterEach(() => {
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('defaults to no built-in skills and records the Hermes commit', () => {
    const { id } = configs.create(input());
    expect(configs.snapshot(id)).toMatchObject({
      bundledSkills: { mode: 'none', names: [], paths: [], contentHash: null },
      hermesCommit: 'abc1234',
    });
  });

  it('snapshots without Hermes when no built-in skills are selected', () => {
    const { id } = configs.create(input());
    const snapshot = service(join(root, 'missing.json')).snapshot(id);
    expect(snapshot.bundledSkills?.mode).toBe('none');
    expect(snapshot).not.toHaveProperty('hermesCommit');
  });

  it('records the resolved skills and changes the hash when the selection changes', () => {
    const none = configs.create(input());
    const one = configs.create(input({ bundledSkills: { mode: 'selected', names: ['arxiv'] } }));
    const both = configs.create(
      input({ bundledSkills: { mode: 'selected', names: ['notes', 'arxiv'] } }),
    );
    const all = configs.create(input({ bundledSkills: { mode: 'all' } }));
    const [noneSnap, oneSnap, bothSnap, allSnap] = [none, one, both, all].map(({ id }) =>
      configs.snapshot(id),
    );

    expect(oneSnap?.bundledSkills).toMatchObject({
      mode: 'selected',
      names: ['arxiv'],
      paths: ['research/arxiv'],
    });
    expect(oneSnap?.bundledSkills?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set([noneSnap?.hash, oneSnap?.hash, bothSnap?.hash]).size).toBe(3);
    // Same files reach the agent either way, so the behaviour hash is the same.
    expect(allSnap?.hash).toBe(bothSnap?.hash);
    expect(allSnap?.bundledSkills?.mode).toBe('all');
  });

  it('rejects built-in skills the installed Hermes does not ship, per field', () => {
    expect(
      rejection(() =>
        configs.create(
          input({ bundledSkills: { mode: 'selected', names: ['arxiv', 'imaginary'] } }),
        ),
      ),
    ).toEqual({
      message: 'Validation failed',
      issues: [
        {
          path: 'bundledSkills.names.1',
          message: 'Hermes abc1234 has no built-in skill "imaginary"',
        },
      ],
    });
    expect(configs.list()).toEqual([]);
  });

  it('rejects selecting built-in skills while Hermes is not installed', () => {
    const withoutHermes = service(join(root, 'missing.json'));
    expect(
      rejection(() => withoutHermes.create(input({ bundledSkills: { mode: 'all' } }))),
    ).toMatchObject({ issues: [{ path: 'bundledSkills.mode' }] });
  });

  it('rejects a custom skill that shares a name with a selected built-in skill', () => {
    const skill = skills.create({ name: 'arxiv', description: 'Mine', content: 'Custom.' });
    expect(
      rejection(() =>
        configs.create(input({ skillIds: [skill.id], bundledSkills: { mode: 'all' } })),
      ),
    ).toMatchObject({ issues: [{ path: 'bundledSkills' }] });
    expect(configs.create(input({ skillIds: [skill.id] })).skillIds).toEqual([skill.id]);
  });
});
