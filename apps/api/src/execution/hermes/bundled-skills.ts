import {
  slugSchema,
  type BundledSkill,
  type BundledSkills,
  type ResolvedBundledSkills,
} from '@higheval/shared';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { sha256Hex } from '../../common/hash.js';

/** Hermes' bundled skills live at `skills/<category>/<name>/SKILL.md` in its checkout. */
const SKILL_FILE = 'SKILL.md';
/** Optional per-category blurb Hermes shows above that category in its skills index. */
const CATEGORY_FILE = 'DESCRIPTION.md';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** The SKILL.md frontmatter fields HighEval reads. Hermes accepts a bare string for `platforms`. */
const frontmatterSchema = z.looseObject({
  name: z.string().optional(),
  description: z.string().default(''),
  platforms: z
    .union([z.string().transform((platform) => [platform]), z.array(z.string())])
    .default([]),
});

export interface ScannedBundledSkill extends BundledSkill {
  /** Skill directory relative to the bundled skills root, e.g. `productivity/pdf`. */
  path: string;
  /** SHA-256 over every file in the directory (relative paths and contents). */
  contentHash: string;
}

export interface CategoryFile {
  /** Relative to the bundled skills root, e.g. `productivity/DESCRIPTION.md`. */
  path: string;
  contentHash: string;
}

export interface BundledSkillScan {
  /** Sorted by name. */
  skills: ScannedBundledSkill[];
  /** Category description files, keyed by category. */
  categoryFiles: Map<string, CategoryFile>;
  /** Skill directories that could not be read, with the reason. */
  skipped: { path: string; reason: string }[];
}

/**
 * Reads Hermes' bundled skills from `root` (`<checkout>/skills`). Like Hermes,
 * a skill's name comes from its frontmatter and falls back to its directory.
 * Anything that is not `<category>/<name>/SKILL.md` (e.g. Hermes' hub index
 * cache) is ignored.
 */
export function scanBundledSkills(root: string): BundledSkillScan {
  const scan: BundledSkillScan = { skills: [], categoryFiles: new Map(), skipped: [] };
  const seen = new Set<string>();
  for (const category of subdirectories(root)) {
    const categoryDir = join(root, category);
    const entries = readdirSync(categoryDir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === CATEGORY_FILE)) {
      const path = `${category}/${CATEGORY_FILE}`;
      scan.categoryFiles.set(category, { path, contentHash: fileHash(join(root, path)) });
    }
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const path = `${category}/${entry.name}`;
      const skillDir = join(root, path);
      let source: string;
      try {
        source = readFileSync(join(skillDir, SKILL_FILE), 'utf8');
      } catch {
        continue; // Not a skill directory.
      }
      const frontmatter = parseFrontmatter(source);
      if (!frontmatter.success) {
        scan.skipped.push({ path, reason: frontmatter.error });
        continue;
      }
      const name = frontmatter.data.name ?? entry.name;
      if (!slugSchema.safeParse(name).success || seen.has(name)) {
        scan.skipped.push({ path, reason: `Unusable or duplicate skill name "${name}"` });
        continue;
      }
      seen.add(name);
      scan.skills.push({
        name,
        category,
        description: frontmatter.data.description.trim(),
        platforms: frontmatter.data.platforms,
        path,
        contentHash: directoryHash(skillDir),
      });
    }
  }
  scan.skills.sort((a, b) => byCodePoint(a.name, b.name));
  return scan;
}

export const NO_BUNDLED_SKILLS: ResolvedBundledSkills = {
  mode: 'none',
  names: [],
  paths: [],
  contentHash: null,
};

export type BundledSkillsResolution =
  | { ok: true; resolved: ResolvedBundledSkills }
  | { ok: false; unknown: { index: number; name: string }[] };

/**
 * Expands a setting into the exact files each run receives: the selected skill
 * directories plus their categories' descriptions, which Hermes shows in its
 * skills index. The content hash covers all of them.
 */
export function resolveBundledSkills(
  scan: BundledSkillScan,
  setting: BundledSkills,
): BundledSkillsResolution {
  if (setting.mode === 'none') return { ok: true, resolved: NO_BUNDLED_SKILLS };
  const byName = new Map(scan.skills.map((skill) => [skill.name, skill]));
  const unknown =
    setting.mode === 'selected'
      ? setting.names.flatMap((name, index) => (byName.has(name) ? [] : [{ index, name }]))
      : [];
  if (unknown.length > 0) return { ok: false, unknown };

  const selected =
    setting.mode === 'all'
      ? scan.skills
      : scan.skills.filter((skill) => setting.names.includes(skill.name));
  const categories = new Set(selected.map((skill) => skill.category));
  const entries: { path: string; contentHash: string }[] = [
    ...selected,
    ...[...categories].flatMap((category) => scan.categoryFiles.get(category) ?? []),
  ].toSorted((a, b) => byCodePoint(a.path, b.path));
  return {
    ok: true,
    resolved: {
      mode: setting.mode,
      names: selected.map((skill) => skill.name),
      paths: entries.map((entry) => entry.path),
      contentHash:
        entries.length > 0
          ? sha256Hex(entries.map(({ path, contentHash }) => [path, contentHash]))
          : null,
    },
  };
}

type FrontmatterResult =
  { success: true; data: z.output<typeof frontmatterSchema> } | { success: false; error: string };

function parseFrontmatter(source: string): FrontmatterResult {
  const block = FRONTMATTER.exec(source)?.[1];
  if (block === undefined) return { success: false, error: 'SKILL.md has no frontmatter' };
  let raw: unknown;
  try {
    raw = parseYaml(block);
  } catch (error) {
    return { success: false, error: `Invalid frontmatter YAML: ${String(error)}` };
  }
  const parsed = frontmatterSchema.safeParse(raw);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, error: `Invalid frontmatter: ${z.prettifyError(parsed.error)}` };
}

function subdirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted(byCodePoint);
}

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Hash over each file's root-relative POSIX path and content hash, in path order. */
function directoryHash(dir: string): string {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((path) => [relative(dir, path).split(sep).join('/'), fileHash(path)] as const)
    .toSorted(([a], [b]) => byCodePoint(a, b));
  return sha256Hex(files);
}

/** Locale-independent ordering, so hashes are the same on every machine. */
export function byCodePoint(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}
