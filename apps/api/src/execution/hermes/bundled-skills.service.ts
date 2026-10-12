import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BundledSkillCatalog, BundledSkills, ResolvedBundledSkills } from '@higheval/shared';
import { validationError } from '../../common/validation-error.js';
import type { Env } from '../../config/env.schema.js';
import {
  byCodePoint,
  NO_BUNDLED_SKILLS,
  resolveBundledSkills,
  scanBundledSkills,
  type BundledSkillScan,
} from './bundled-skills.js';
import {
  bundledSkillsDir,
  HERMES_NOT_INSTALLED,
  loadHermesRuntime,
  type HermesRuntime,
} from './hermes-runtime.js';

export interface BundledSkillsResolved {
  /** Commit of the installed Hermes; undefined when Hermes is not installed. */
  hermesCommit: string | undefined;
  bundledSkills: ResolvedBundledSkills;
}

/**
 * Catalog of the built-in skills shipped with the installed Hermes. The scan
 * (frontmatter and content hashes of ~330 files) is cached per checkout and
 * commit, so reinstalling Hermes is picked up without a restart.
 */
@Injectable()
export class BundledSkillsService {
  private readonly logger = new Logger(BundledSkillsService.name);
  private cached: { key: string; scan: BundledSkillScan } | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  catalog(): BundledSkillCatalog {
    const runtime = this.runtime();
    if (!runtime) return { status: 'unavailable', message: HERMES_NOT_INSTALLED, skills: [] };
    return {
      status: 'available',
      hermesCommit: runtime.commit,
      skills: this.scan(runtime)
        .skills.map(({ name, category, description, platforms }) => ({
          name,
          category,
          description,
          platforms,
        }))
        .toSorted((a, b) => byCodePoint(a.category, b.category) || byCodePoint(a.name, b.name)),
    };
  }

  /**
   * Resolves a setting against the installed Hermes. Throws a 400 with field
   * issues when it names skills this Hermes does not ship, or needs built-in
   * skills while Hermes is not installed.
   */
  resolve(setting: BundledSkills): BundledSkillsResolved {
    const runtime = this.runtime();
    if (setting.mode === 'none') {
      return { hermesCommit: runtime?.commit, bundledSkills: NO_BUNDLED_SKILLS };
    }
    if (!runtime) {
      throw validationError([
        {
          path: 'bundledSkills.mode',
          message: 'Hermes is not installed, so its built-in skills are unavailable',
        },
      ]);
    }
    const resolution = resolveBundledSkills(this.scan(runtime), setting);
    if (!resolution.ok) {
      throw validationError(
        resolution.unknown.map(({ index, name }) => ({
          path: `bundledSkills.names.${String(index)}`,
          message: `Hermes ${runtime.commit.slice(0, 7)} has no built-in skill "${name}"`,
        })),
      );
    }
    return { hermesCommit: runtime.commit, bundledSkills: resolution.resolved };
  }

  private runtime(): HermesRuntime | null {
    return loadHermesRuntime(this.config.get('HERMES_MANIFEST', { infer: true }));
  }

  private scan(runtime: HermesRuntime): BundledSkillScan {
    const key = `${runtime.repo}@${runtime.commit}`;
    if (this.cached?.key !== key) {
      const scan = scanBundledSkills(bundledSkillsDir(runtime));
      for (const { path, reason } of scan.skipped) {
        this.logger.warn(`Ignoring Hermes skill ${path}: ${reason}`);
      }
      this.cached = { key, scan };
    }
    return this.cached.scan;
  }
}
