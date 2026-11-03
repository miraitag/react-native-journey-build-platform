import { describe, expect, it } from 'vitest';
import { parseSampleJson, sampleToJson } from './state-sample.ts';

describe('parseSampleJson', () => {
  it('accepts objects, and empty text as an empty sample', () => {
    expect(parseSampleJson('{"items":[1,2],"total":3}')).toEqual({
      ok: true,
      sample: { items: [1, 2], total: 3 },
    });
    expect(parseSampleJson('  ')).toEqual({ ok: true, sample: {} });
  });

  it('rejects invalid JSON and non-objects with their reason', () => {
    expect(parseSampleJson('{oops')).toEqual({ ok: false, reason: 'syntax' });
    expect(parseSampleJson('[1]')).toEqual({ ok: false, reason: 'notObject' });
    expect(parseSampleJson('3')).toEqual({ ok: false, reason: 'notObject' });
    expect(parseSampleJson('null')).toEqual({ ok: false, reason: 'notObject' });
  });
});

describe('sampleToJson', () => {
  it('round-trips through the parser', () => {
    const sample = { a: { b: [1, 'x', null] } };
    expect(parseSampleJson(sampleToJson(sample))).toEqual({ ok: true, sample });
    expect(sampleToJson({})).toBe('{}');
  });
});
