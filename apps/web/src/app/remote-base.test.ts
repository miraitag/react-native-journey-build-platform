import { describe, expect, it } from 'vitest';
import { createDocument, type RnjbDocument } from '@rnjb/core';
import { baseOf } from './remote-base.ts';

describe('baseOf', () => {
  const doc = (name: string): RnjbDocument =>
    createDocument(
      {
        kind: 'journey',
        name,
        slug: 'origen',
        profile: { id: 'test-profile', version: '1.0.0' },
        libraries: [],
        platformVersion: '0.0.0-test',
        formatVersion: 1,
      },
      { now: () => '2026-01-01T00:00:00.000Z' },
    );

  it('ignores provenance, so recording the origin does not make a copy look edited', async () => {
    const original = doc('A');
    const copy: RnjbDocument = {
      ...original,
      provenance: { remote: { remote: 'r', ref: 'main', path: 'p', commit: 'c', base: 'x' } },
    };
    expect(await baseOf(copy)).toBe(await baseOf(original));
  });

  it('changes when the content changes', async () => {
    expect(await baseOf(doc('A'))).not.toBe(await baseOf(doc('B')));
  });
});
