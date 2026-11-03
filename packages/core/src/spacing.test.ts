import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createDocument,
  addScreen,
  setSpacing,
  type CommandContext,
} from './commands.ts';
import { parseSpacingInput, snapToScale } from './spacing.ts';

describe('snapToScale', () => {
  const scale = [0, 4, 8, 16, 24];
  it('snaps to the nearest step, ties to the smaller one', () => {
    expect(snapToScale(5, scale)).toBe(4);
    expect(snapToScale(6, scale)).toBe(4);
    expect(snapToScale(7, scale)).toBe(8);
    expect(snapToScale(100, scale)).toBe(24);
  });
  it('leaves the value free without a scale', () => {
    expect(snapToScale(5, undefined)).toBe(5);
    expect(snapToScale(5, [])).toBe(5);
  });
});

describe('parseSpacingInput', () => {
  it('accepts non-negative finite numbers only', () => {
    expect(parseSpacingInput(' 12 ')).toBe(12);
    expect(parseSpacingInput('0')).toBe(0);
    expect(parseSpacingInput('-1')).toBeUndefined();
    expect(parseSpacingInput('')).toBeUndefined();
    expect(parseSpacingInput('x')).toBeUndefined();
  });
});

describe('setSpacing', () => {
  const ctx = (): CommandContext => {
    let n = 0;
    return { ids: { next: () => `id${++n}` }, clock: { now: () => '2026-01-01T00:00:00.000Z' } };
  };

  it('sets and clears margin, padding and gap, dropping empty groups', () => {
    const c = ctx();
    let screenId = '';
    let doc = createDocument(
      {
        kind: 'journey',
        name: 'T',
        slug: 't',
        profile: { id: 'p', version: '1.0.0' },
        libraries: [],
        platformVersion: '0.0.0-test',
        formatVersion: 1,
      },
      c.clock,
    );
    doc = applyCommand(
      doc,
      addScreen({ name: 'S', root: { package: 'p', component: 'View', version: '1' } }, (id) => {
        screenId = id;
      }),
      c,
    ).document;
    const rootId = doc.screens[0]!.rootId;

    doc = applyCommand(
      doc,
      setSpacing(screenId, rootId, 'padding.top', { type: 'literal', value: 8 }),
      c,
    ).document;
    doc = applyCommand(
      doc,
      setSpacing(screenId, rootId, 'gap', { type: 'literal', value: 4 }),
      c,
    ).document;
    expect(doc.screens[0]!.nodes[rootId]).toMatchObject({
      spacing: {
        padding: { top: { type: 'literal', value: 8 } },
        gap: { type: 'literal', value: 4 },
      },
    });

    doc = applyCommand(doc, setSpacing(screenId, rootId, 'padding.top', undefined), c).document;
    doc = applyCommand(doc, setSpacing(screenId, rootId, 'gap', undefined), c).document;
    expect(doc.screens[0]!.nodes[rootId]).toMatchObject({ spacing: {} });
  });
});
