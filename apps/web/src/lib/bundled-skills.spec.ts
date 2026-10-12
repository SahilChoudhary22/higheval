import type { BundledSkill } from '@higheval/shared';
import { describe, expect, it } from 'vitest';
import { bundledSkillsSummary, groupByCategory, platformLabel } from './bundled-skills';

const skill = (name: string, category: string, description = ''): BundledSkill => ({
  name,
  category,
  description,
  platforms: [],
});

describe('bundled skills', () => {
  it('labels only platform-gated skills', () => {
    expect(platformLabel([])).toBeNull();
    expect(platformLabel(['linux', 'macos', 'windows'])).toBeNull();
    expect(platformLabel(['macos'])).toBe('macOS only');
    expect(platformLabel(['linux', 'macos'])).toBe('Linux and macOS only');
  });

  it('groups by category and filters by name, category or description', () => {
    const skills = [
      skill('docx', 'productivity', 'Word documents.'),
      skill('pdf', 'productivity', 'Read PDFs.'),
      skill('arxiv', 'research', 'Search papers.'),
    ];
    expect(groupByCategory(skills, '')).toEqual([
      { category: 'productivity', skills: [skills[0], skills[1]] },
      { category: 'research', skills: [skills[2]] },
    ]);
    expect(groupByCategory(skills, ' PAPERS ')).toEqual([
      { category: 'research', skills: [skills[2]] },
    ]);
    expect(groupByCategory(skills, 'productivity').map((group) => group.skills.length)).toEqual([
      2,
    ]);
    expect(groupByCategory(skills, 'nothing')).toEqual([]);
  });

  it('summarises the setting compactly', () => {
    expect(bundledSkillsSummary({ mode: 'none' })).toBeNull();
    expect(bundledSkillsSummary({ mode: 'all' })).toBe('built-in: all');
    expect(bundledSkillsSummary({ mode: 'selected', names: ['a', 'b', 'c'] })).toBe('built-in: 3');
  });
});
