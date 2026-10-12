import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, count, desc, eq } from 'drizzle-orm';
import type { Suite, suiteInputSchema, SuiteSummary, Task } from '@higheval/shared';
import type { z } from 'zod';
import { sha256Hex } from '../common/hash.js';
import { newId, nowIso } from '../common/ids.js';
import { InjectDb } from '../database/database.module.js';
import type { Db } from '../database/database.js';
import { suites, tasks } from '../database/schema.js';

export type SuiteData = z.output<typeof suiteInputSchema>;

@Injectable()
export class SuitesService {
  constructor(@InjectDb() private readonly db: Db) {}

  list(): SuiteSummary[] {
    return this.db
      .select({
        id: suites.id,
        name: suites.name,
        description: suites.description,
        createdAt: suites.createdAt,
        updatedAt: suites.updatedAt,
        taskCount: count(tasks.id),
      })
      .from(suites)
      .leftJoin(tasks, eq(tasks.suiteId, suites.id))
      .groupBy(suites.id)
      .orderBy(desc(suites.createdAt))
      .all();
  }

  get(id: string): Suite {
    const suite = this.db.select().from(suites).where(eq(suites.id, id)).get();
    if (!suite) throw new NotFoundException(`Suite ${id} not found`);
    const rows = this.db
      .select()
      .from(tasks)
      .where(eq(tasks.suiteId, id))
      .orderBy(asc(tasks.position))
      .all();
    return { ...suite, tasks: rows.map(({ position: _position, ...task }) => task) };
  }

  findByName(name: string): SuiteSummary | undefined {
    return this.list().find((suite) => suite.name === name);
  }

  create(input: SuiteData): Suite {
    const id = newId();
    const timestamp = nowIso();
    this.db.transaction((tx) => {
      tx.insert(suites)
        .values({
          id,
          name: input.name,
          description: input.description,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      insertTasks(tx, id, input.tasks);
    });
    return this.get(id);
  }

  /** Replaces the suite's tasks. Running experiments are unaffected: they use snapshots. */
  update(id: string, input: SuiteData): Suite {
    this.get(id);
    this.db.transaction((tx) => {
      tx.update(suites)
        .set({ name: input.name, description: input.description, updatedAt: nowIso() })
        .where(eq(suites.id, id))
        .run();
      tx.delete(tasks).where(eq(tasks.suiteId, id)).run();
      insertTasks(tx, id, input.tasks);
    });
    return this.get(id);
  }

  remove(id: string): void {
    this.get(id);
    this.db.delete(suites).where(eq(suites.id, id)).run();
  }
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function insertTasks(tx: Tx, suiteId: string, inputs: SuiteData['tasks']): void {
  tx.insert(tasks)
    .values(inputs.map((task, position) => ({ ...task, id: newId(), suiteId, position })))
    .run();
}

/** Hash of everything about the tasks that can influence a result. */
export function hashTasks(taskList: readonly Task[]): string {
  return sha256Hex(
    taskList.map(({ key, prompt, fixtures, scorers, passThreshold }) => ({
      key,
      prompt,
      fixtures,
      scorers,
      passThreshold,
    })),
  );
}
