import { BadRequestException } from '@nestjs/common';

export interface FieldIssue {
  /** Dotted path of the offending field, e.g. `bundledSkills.names.0`. */
  path: string;
  message: string;
}

/** A 400 with field-level issues, the shape forms use to show errors next to fields. */
export function validationError(issues: FieldIssue[]): BadRequestException {
  return new BadRequestException({ message: 'Validation failed', issues });
}
