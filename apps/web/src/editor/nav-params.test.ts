import { describe, expect, it } from 'vitest';
import { formatParams, parseParams } from './nav-params.ts';

describe('parseParams', () => {
  it('parses names, optional marks and generic types', () => {
    expect(parseParams('userId: string, retry?: boolean, map: Record<string, number>')).toEqual([
      { name: 'userId', type: 'string' },
      { name: 'retry', type: 'boolean', optional: true },
      { name: 'map', type: 'Record<string, number>' },
    ]);
    expect(parseParams('')).toEqual([]);
  });

  it('rejects malformed or repeated entries', () => {
    expect(parseParams('userId')).toBeUndefined();
    expect(parseParams('1a: string')).toBeUndefined();
    expect(parseParams('a: string, a: number')).toBeUndefined();
    expect(parseParams('a: ')).toBeUndefined();
  });

  it('round-trips through formatParams', () => {
    const params = [
      { name: 'a', type: 'string' },
      { name: 'b', type: 'Array<number>', optional: true },
    ];
    expect(parseParams(formatParams(params))).toEqual(params);
  });
});
