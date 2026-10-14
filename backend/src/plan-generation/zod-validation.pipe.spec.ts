import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().trim().min(1),
  age: z.int().min(18),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value for a valid body', () => {
    expect(pipe.transform({ name: '  Ada  ', age: 30 })).toEqual({
      name: 'Ada',
      age: 30,
    });
  });

  it('throws BadRequestException listing field paths and fixed messages', () => {
    let error: unknown;
    try {
      pipe.transform({ name: '', age: 'twelve' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'Validation failed',
      issues: [
        { path: 'name', message: 'is too small or too short' },
        { path: 'age', message: 'has the wrong type or is missing' },
      ],
    });
  });

  it('does not echo the raw offending value', () => {
    const secret = 'super-secret-raw-value-123';
    let error: unknown;
    try {
      pipe.transform({ name: 'Ada', age: secret });
    } catch (caught) {
      error = caught;
    }
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).not.toContain(secret);
  });

  it('reports a non-object body under the body path', () => {
    let error: unknown;
    try {
      pipe.transform('nope');
    } catch (caught) {
      error = caught;
    }
    expect((error as BadRequestException).getResponse()).toMatchObject({
      issues: [{ path: 'body' }],
    });
  });
});
