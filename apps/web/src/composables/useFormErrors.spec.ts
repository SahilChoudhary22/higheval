import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '@/api/client';
import { useFormErrors } from './useFormErrors';

const schema = z
  .object({
    name: z.string().min(1, 'Required'),
    memory: z.object({ entries: z.array(z.string().min(1, 'Empty entry')) }),
    low: z.number(),
    high: z.number(),
  })
  .refine((value) => value.low <= value.high, { message: 'Low must not exceed high' });

describe('useFormErrors', () => {
  it('matches nested errors to their field and reports every error', () => {
    const form = useFormErrors();
    expect(
      form.validate(schema, { name: '', memory: { entries: ['ok', ''] }, low: 1, high: 2 }),
    ).toBeNull();
    expect(form.errorFor('name')).toBe('Required');
    expect(form.errorFor('memory')).toBe('Empty entry');
    expect(form.errorFor('mem')).toBeUndefined();
    expect(form.formError.value).toBe('Some fields need attention.');
    expect(form.unclaimed(['name', 'memory'])).toEqual([]);
  });

  it('lists errors that no rendered field claims', () => {
    const form = useFormErrors();
    form.validate(schema, { name: 'x', memory: { entries: [] }, low: 3, high: 2 });
    expect(form.unclaimed(['name', 'memory', 'low', 'high'])).toEqual(['Low must not exceed high']);
    form.fromError(
      new ApiError('Validation failed', 400, [{ path: 'extra.path', message: 'Bad' }]),
    );
    expect(form.unclaimed(['name'])).toEqual(['extra.path: Bad']);
  });

  it('clears errors on success and shows non-field failures as the form error', () => {
    const form = useFormErrors();
    expect(
      form.validate(schema, { name: 'x', memory: { entries: [] }, low: 1, high: 2 }),
    ).not.toBeNull();
    expect(form.formError.value).toBeNull();
    form.fromError(new Error('Network down'));
    expect(form.formError.value).toBe('Network down');
    form.clear();
    expect(form.formError.value).toBeNull();
  });

  it('uses plain-language messages where the schema has none', () => {
    const form = useFormErrors();
    form.validate(z.object({ name: z.string().min(1), turns: z.int().min(1).max(100) }), {
      name: '',
      turns: 500,
    });
    expect(form.errorFor('name')).toBe('Required');
    expect(form.errorFor('turns')).toBe('Must be at most 100');
    form.validate(z.object({ margin: z.number() }), { margin: '' });
    expect(form.errorFor('margin')).toBe('Enter a number');
  });

  it('focuses the first invalid control', async () => {
    document.body.innerHTML = `
      <form>
        <input id="valid" aria-invalid="false" />
        <input id="first" aria-invalid="true" />
        <input id="second" aria-invalid="true" />
      </form>`;
    await useFormErrors().focusFirstInvalid(document.querySelector('form'));
    expect(document.activeElement?.id).toBe('first');
  });
});
