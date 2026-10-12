import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BundledSkillCatalog } from '@higheval/shared';
import type { Env } from '../../config/env.schema.js';
import { scanBundledSkills, type BundledSkillScan } from './bundled-skills.js';
import {
  bundledSkillsDir,
  HERMES_NOT_INSTALLED,
  loadHermesRuntime,
  type HermesRuntime,
} from './hermes-runtime.js';

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
    const installed = this.load();
    if (!installed) return { status: 'unavailable', message: HERMES_NOT_INSTALLED, skills: [] };
    return {
      status: 'available',
      hermesCommit: installed.runtime.commit,
      skills: installed.scan.skills.map(({ name, category, description, platforms }) => ({
        name,
        category,
        description,
        platforms,
      })),
    };
  }

  private load(): { runtime: HermesRuntime; scan: BundledSkillScan } | null {
    const runtime = loadHermesRuntime(this.config.get('HERMES_MANIFEST', { infer: true }));
    if (!runtime) return null;
    const key = `${runtime.repo}@${runtime.commit}`;
    if (this.cached?.key !== key) {
      const scan = scanBundledSkills(bundledSkillsDir(runtime));
      for (const { path, reason } of scan.skipped) {
        this.logger.warn(`Ignoring Hermes skill ${path}: ${reason}`);
      }
      this.cached = { key, scan };
    }
    return { runtime, scan: this.cached.scan };
  }
}
