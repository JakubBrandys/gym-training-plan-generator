import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_type: 'has the wrong type or is missing',
  too_small: 'is too small or too short',
  too_big: 'is too large or too long',
  invalid_value: 'is not an allowed value',
};

const FALLBACK_MESSAGE = 'is invalid';

const formatPath = (path: PropertyKey[]): string =>
  path.length > 0 ? path.map(String).join('.') : 'body';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: MESSAGES_BY_CODE[issue.code] ?? FALLBACK_MESSAGE,
      })),
    });
  }
}
