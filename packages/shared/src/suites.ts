import { z } from 'zod';
import { idSchema, relativePathSchema, slugSchema, timestampSchema } from './common.js';
import { scorerSpecSchema } from './scoring.js';

/** A file materialized into the agent's working directory before the run. */
export const fixtureFileSchema = z.object({
  path: relativePathSchema,
  content: z.string().max(200_000),
});
export type FixtureFile = z.infer<typeof fixtureFileSchema>;

export const taskInputSchema = z.object({
  key: slugSchema,
  title: z.string().min(1).max(200),
  prompt: z.string().min(1).max(20_000),
  fixtures: z.array(fixtureFileSchema).max(20).default([]),
  scorers: z.array(scorerSpecSchema).min(1).max(20),
  /** Weighted score at or above which the task counts as passed. */
  passThreshold: z.number().min(0).max(1).default(1),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});
export type TaskInput = z.input<typeof taskInputSchema>;

export const taskSchema = taskInputSchema.extend({
  id: idSchema,
  suiteId: idSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const suiteInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2_000).default(''),
    tasks: z.array(taskInputSchema).min(1).max(200),
  })
  .refine((suite) => new Set(suite.tasks.map((task) => task.key)).size === suite.tasks.length, {
    message: 'Task keys must be unique within a suite',
    path: ['tasks'],
  });
export type SuiteInput = z.input<typeof suiteInputSchema>;

export const suiteSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  taskCount: z.int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type SuiteSummary = z.infer<typeof suiteSummarySchema>;

export const suiteSchema = suiteSummarySchema.omit({ taskCount: true }).extend({
  tasks: z.array(taskSchema),
});
export type Suite = z.infer<typeof suiteSchema>;
