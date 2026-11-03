import { describe, expect, it } from 'vitest';
import { merge3 } from './merge3.ts';

const lines = (...values: string[]): string => values.join('\n');

describe('merge3', () => {
  it('keeps both sides when they touch different lines', () => {
    const base = lines('a', 'b', 'c', 'd', 'e');
    const ours = lines('a', 'B', 'c', 'd', 'e');
    const theirs = lines('a', 'b', 'c', 'd', 'E');
    expect(merge3(base, ours, theirs)).toEqual({
      text: lines('a', 'B', 'c', 'd', 'E'),
      conflicts: 0,
    });
  });

  it('takes the only side that changed', () => {
    expect(merge3('x', 'x', 'y')).toEqual({ text: 'y', conflicts: 0 });
    expect(merge3('x', 'y', 'x')).toEqual({ text: 'y', conflicts: 0 });
  });

  it('accepts identical changes on both sides', () => {
    expect(merge3('a\nb', 'a\nz', 'a\nz').conflicts).toBe(0);
  });

  it('marks a conflict when both sides change the same lines differently', () => {
    const result = merge3(lines('a', 'b', 'c'), lines('a', 'X', 'c'), lines('a', 'Y', 'c'));
    expect(result.conflicts).toBe(1);
    expect(result.text).toBe(
      lines('a', '<<<<<<< ours', 'X', '=======', 'Y', '>>>>>>> theirs', 'c'),
    );
  });

  it('merges insertions made at different places', () => {
    const base = lines('a', 'b', 'c');
    const ours = lines('0', 'a', 'b', 'c');
    const theirs = lines('a', 'b', 'c', 'd');
    expect(merge3(base, ours, theirs).text).toBe(lines('0', 'a', 'b', 'c', 'd'));
  });

  it('handles an empty base as a whole-file conflict', () => {
    expect(merge3('', 'a', 'b').conflicts).toBe(1);
  });
});
