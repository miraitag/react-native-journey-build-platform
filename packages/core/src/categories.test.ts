import { describe, expect, it } from 'vitest';
import { validateCategories } from './categories.ts';

describe('validateCategories', () => {
  it('accepts two levels', () => {
    const result = validateCategories([
      { id: 'forms' },
      { id: 'inputs', parentId: 'forms' },
      { id: 'buttons' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects a third level with RNJB-010', () => {
    const result = validateCategories([
      { id: 'a' },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
    ]);
    expect(!result.ok && result.error.code).toBe('RNJB-010');
  });

  it('rejects a missing parent with RNJB-011', () => {
    const result = validateCategories([{ id: 'b', parentId: 'ghost' }]);
    expect(!result.ok && result.error.code).toBe('RNJB-011');
  });
});
