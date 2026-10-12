import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import type { Env } from '../config/env.schema.js';
import { openDatabase, type OpenedDatabase } from './database.js';

export const DATABASE = Symbol('DATABASE');
const CONNECTION = Symbol('DATABASE_CONNECTION');

/** Injects the Drizzle database handle. */
export const InjectDb = (): ParameterDecorator => Inject(DATABASE);

@Global()
@Module({
  providers: [
    {
      provide: CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): OpenedDatabase =>
        openDatabase(resolve(config.get('DATA_DIR', { infer: true }), 'higheval.db')),
    },
    {
      provide: DATABASE,
      inject: [CONNECTION],
      useFactory: (connection: OpenedDatabase) => connection.db,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(CONNECTION) private readonly connection: OpenedDatabase) {}

  onApplicationShutdown(): void {
    this.connection.close();
  }
}
