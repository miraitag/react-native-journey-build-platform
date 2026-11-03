import { describe, expect, it } from 'vitest';
import type { WorkspaceEntry } from '@rnjb/core';
import { NO_FILTERS, filterOptions, matchesFilters } from './filters.ts';

const entry = (libraries: string[], profile: string, updatedAt: string) =>
  ({ libraries, profile: { id: profile, version: '1' }, updatedAt }) as WorkspaceEntry;
const now = Date.parse('2026-11-03T00:00:00Z');
const a = entry(['ui', 'forms'], 'feature-library', '2026-11-01T00:00:00Z');
const b = entry(['ui'], 'other', '2026-09-01T00:00:00Z');

describe('home filters', () => {
  it('filters by library, profile and recency, and lets everything through by default', () => {
    expect(matchesFilters(a, NO_FILTERS, now)).toBe(true);
    expect(matchesFilters(b, { ...NO_FILTERS, library: 'forms' }, now)).toBe(false);
    expect(matchesFilters(b, { ...NO_FILTERS, profile: 'other' }, now)).toBe(true);
    expect(matchesFilters(a, { ...NO_FILTERS, days: 7 }, now)).toBe(true);
    expect(matchesFilters(b, { ...NO_FILTERS, days: 30 }, now)).toBe(false);
  });

  it('offers only the values in use', () => {
    expect(filterOptions([a, b])).toEqual({
      libraries: ['forms', 'ui'],
      profiles: ['feature-library', 'other'],
    });
  });
});
