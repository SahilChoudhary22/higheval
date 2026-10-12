import {
  agentConfigSchema,
  bundledSkillCatalogSchema,
  comparisonSchema,
  experimentSchema,
  healthResponseSchema,
  runDetailSchema,
  runSummarySchema,
  skillSchema,
  suiteSchema,
  suiteSummarySchema,
  type AgentConfigInput,
  type ExperimentInput,
  type SkillInput,
  type SuiteInput,
} from '@higheval/shared';
import { z } from 'zod';
import { deleteResource, getJson, postJson, putJson } from './client';

/** Typed API surface. Every response is validated against the shared contract. */
export const api = {
  health: () => getJson('/health', healthResponseSchema),

  hermes: {
    skills: () => getJson('/hermes/skills', bundledSkillCatalogSchema),
  },

  suites: {
    list: () => getJson('/suites', z.array(suiteSummarySchema)),
    get: (id: string) => getJson(`/suites/${id}`, suiteSchema),
    create: (input: SuiteInput) => postJson('/suites', input, suiteSchema),
    update: (id: string, input: SuiteInput) => putJson(`/suites/${id}`, input, suiteSchema),
    remove: (id: string) => deleteResource(`/suites/${id}`),
  },

  skills: {
    list: () => getJson('/skills', z.array(skillSchema)),
    get: (id: string) => getJson(`/skills/${id}`, skillSchema),
    create: (input: SkillInput) => postJson('/skills', input, skillSchema),
    update: (id: string, input: SkillInput) => putJson(`/skills/${id}`, input, skillSchema),
    remove: (id: string) => deleteResource(`/skills/${id}`),
  },

  configs: {
    list: () => getJson('/configs', z.array(agentConfigSchema)),
    get: (id: string) => getJson(`/configs/${id}`, agentConfigSchema),
    create: (input: AgentConfigInput) => postJson('/configs', input, agentConfigSchema),
    update: (id: string, input: AgentConfigInput) =>
      putJson(`/configs/${id}`, input, agentConfigSchema),
    remove: (id: string) => deleteResource(`/configs/${id}`),
  },

  experiments: {
    list: () => getJson('/experiments', z.array(experimentSchema)),
    get: (id: string) => getJson(`/experiments/${id}`, experimentSchema),
    create: (input: ExperimentInput) => postJson('/experiments', input, experimentSchema),
    cancel: (id: string) => postJson(`/experiments/${id}/cancel`, {}, experimentSchema),
    remove: (id: string) => deleteResource(`/experiments/${id}`),
    runs: (id: string) => getJson(`/experiments/${id}/runs`, z.array(runSummarySchema)),
    comparison: (id: string) => getJson(`/experiments/${id}/comparison`, comparisonSchema),
  },

  runs: {
    get: (id: string) => getJson(`/runs/${id}`, runDetailSchema),
  },
};
