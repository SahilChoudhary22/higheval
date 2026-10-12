import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from './paths.js';

const rootPackageSchema = z.object({ version: z.string() });

export const APP_VERSION = rootPackageSchema.parse(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')),
).version;
