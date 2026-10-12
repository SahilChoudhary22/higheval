import { Injectable, type PipeTransform } from '@nestjs/common';
import { friendlyError } from '@higheval/shared';
import { z } from 'zod';
import { validationError } from './validation-error.js';

/** Validates and parses a request body/param against a shared Zod contract. */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value, { error: friendlyError });
    if (!result.success) {
      throw validationError(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
