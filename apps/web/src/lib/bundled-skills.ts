import type { BundledSkill, BundledSkills } from '@higheval/shared';

const PLATFORM_NAMES: Record<string, string> = {
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
};

/**
 * Badge for a skill that Hermes only loads on some operating systems, e.g.
 * "macOS only"; null when it loads everywhere.
 */
export function platformLabel(platforms: readonly string[]): string | null {
  const known = Object.keys(PLATFORM_NAMES);
  if (platforms.length === 0 || known.every((platform) => platforms.includes(platform))) {
    return null;
  }
  const names = platforms.map((platform) => PLATFORM_NAMES[platform] ?? platform);
  return `${names.join(' and ')} only`;
}

export interface SkillGroup {
  category: string;
  skills: BundledSkill[];
}

/**
 * Skills matching `query` (name, category or description), grouped by
 * category. Keeps the catalog's order (by category, then name).
 */
export function groupByCategory(skills: readonly BundledSkill[], query: string): SkillGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, BundledSkill[]>();
  for (const skill of skills) {
    const haystack = `${skill.name} ${skill.category} ${skill.description}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    groups.set(skill.category, [...(groups.get(skill.category) ?? []), skill]);
  }
  return [...groups].map(([category, members]) => ({ category, skills: members }));
}

/** Compact summary for lists, e.g. "built-in: 3"; null when none are used. */
export function bundledSkillsSummary(setting: BundledSkills): string | null {
  switch (setting.mode) {
    case 'none':
      return null;
    case 'all':
      return 'built-in: all';
    case 'selected':
      return `built-in: ${String(setting.names.length)}`;
  }
}
