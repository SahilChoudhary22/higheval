import type { ConfigSnapshot } from '@higheval/shared';
import { buildRunPlan } from './run-plan.js';

const base: ConfigSnapshot = {
  id: 'c1',
  name: 'Baseline',
  description: '',
  model: { provider: 'openrouter', model: 'vendor/model:free' },
  skills: [],
  bundledSkills: { mode: 'none', names: [], paths: [], contentHash: null },
  memory: { mode: 'disabled' },
  toolsets: [],
  maxTurns: 8,
  timeoutSeconds: 120,
  hash: 'h'.repeat(64),
};
const paths = { promptFile: '/run/prompt.md', workDir: '/run/work' };

function hermesConfig(plan: ReturnType<typeof buildRunPlan>): unknown {
  return JSON.parse(plan.homeFiles['config.yaml'] ?? '{}');
}

describe('buildRunPlan', () => {
  it('expresses "no tools" via an empty platform toolset and no --toolsets flag', () => {
    const plan = buildRunPlan(base, paths);
    expect(plan.args).not.toContain('--toolsets');
    expect(hermesConfig(plan)).toMatchObject({ platform_toolsets: { cli: [] } });
  });

  it('sets the model in config, never on the command line', () => {
    const plan = buildRunPlan(base, paths);
    expect(plan.args).not.toContain('--model');
    expect(plan.args).not.toContain('--provider');
    expect(hermesConfig(plan)).toMatchObject({
      model: { provider: 'openrouter', default: 'vendor/model:free' },
    });
  });

  it('pins isolation settings off', () => {
    const config = hermesConfig(buildRunPlan(base, paths));
    expect(config).toMatchObject({
      fallback_providers: [],
      openrouter: { response_cache: false },
      provider_routing: { sort: 'price' },
      agent: { coding_context: 'off', max_turns: 8 },
      memory: { memory_enabled: false, user_profile_enabled: false },
      skills: { external_dirs: [], project_discovery: false, auto_load: [] },
      cli: { expose_on_path: false },
    });
  });

  it('materializes only the selected skills and preloads them', () => {
    const plan = buildRunPlan(
      {
        ...base,
        toolsets: ['file', 'terminal'],
        skills: [
          {
            name: 'invoice-rules',
            description: 'Rules: "net 30"',
            content: '# Rules\nPay on time.',
          },
        ],
      },
      paths,
    );
    expect(plan.args).toEqual(
      expect.arrayContaining(['--toolsets', 'file,terminal', '--skills', 'invoice-rules']),
    );
    expect(plan.homeFiles['skills/invoice-rules/SKILL.md']).toBe(
      '---\nname: invoice-rules\ndescription: "Rules: \\"net 30\\""\n---\n\n# Rules\nPay on time.\n',
    );
  });

  it('seeds memory entries using the Hermes delimiter and enables memory', () => {
    const plan = buildRunPlan(
      { ...base, memory: { mode: 'seeded', entries: ['Fact A', 'Fact B'] } },
      paths,
    );
    expect(plan.homeFiles['memories/MEMORY.md']).toBe('Fact A\n§\nFact B');
    expect(hermesConfig(plan)).toMatchObject({ memory: { memory_enabled: true } });
  });

  describe('built-in skills', () => {
    const contentHash = 'c'.repeat(64);

    it('copies nothing and leaves the skills toolset off when none are selected', () => {
      const plan = buildRunPlan({ ...base, toolsets: ['file'] }, paths);
      expect(plan.bundledSkillPaths).toEqual([]);
      expect(plan.args).toEqual(expect.arrayContaining(['--toolsets', 'file']));
      expect(hermesConfig(plan)).toMatchObject({ platform_toolsets: { cli: ['file'] } });
    });

    it('treats snapshots from before built-in skills existed as having none', () => {
      const { bundledSkills: _omitted, ...legacy } = base;
      const plan = buildRunPlan(legacy, paths);
      expect(plan.bundledSkillPaths).toEqual([]);
      expect(plan.args).not.toContain('--toolsets');
    });

    it('copies the selected skills and enables discovery without preloading them', () => {
      const plan = buildRunPlan(
        {
          ...base,
          toolsets: ['file'],
          bundledSkills: {
            mode: 'selected',
            names: ['arxiv'],
            paths: ['research/DESCRIPTION.md', 'research/arxiv'],
            contentHash,
          },
        },
        paths,
      );
      expect(plan.bundledSkillPaths).toEqual(['research/DESCRIPTION.md', 'research/arxiv']);
      expect(plan.args).toEqual(expect.arrayContaining(['--toolsets', 'file,skills']));
      expect(plan.args).not.toContain('--skills');
      expect(hermesConfig(plan)).toMatchObject({
        platform_toolsets: { cli: ['file', 'skills'] },
        skills: { external_dirs: [], project_discovery: false, auto_load: [] },
      });
      expect(Object.keys(plan.homeFiles)).toEqual(['config.yaml']);
    });

    it('copies every skill for "all", even in a run with no other tools', () => {
      const plan = buildRunPlan(
        {
          ...base,
          bundledSkills: {
            mode: 'all',
            names: ['arxiv', 'notes'],
            paths: ['productivity/notes', 'research/arxiv'],
            contentHash,
          },
        },
        paths,
      );
      expect(plan.bundledSkillPaths).toEqual(['productivity/notes', 'research/arxiv']);
      expect(plan.args).toEqual(expect.arrayContaining(['--toolsets', 'skills']));
    });

    it('does not list the skills toolset twice when the config already enables it', () => {
      const plan = buildRunPlan(
        {
          ...base,
          toolsets: ['skills'],
          bundledSkills: {
            mode: 'selected',
            names: ['arxiv'],
            paths: ['research/arxiv'],
            contentHash,
          },
        },
        paths,
      );
      expect(hermesConfig(plan)).toMatchObject({ platform_toolsets: { cli: ['skills'] } });
    });
  });
});
