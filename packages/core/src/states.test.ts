import { describe, expect, it } from 'vitest';
import {
  addScreen,
  addState,
  applyCommand,
  createDocument,
  removeState,
  renameState,
  setStateSample,
  STATE_NAME_PATTERN,
  type CommandContext,
} from './commands.ts';
import type { RnjbDocument } from './entities.ts';
import { RnjbError } from './errors.ts';

function setup() {
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  let doc: RnjbDocument = createDocument(
    {
      kind: 'journey',
      name: 'T',
      slug: 'tst',
      profile: { id: 'test-profile', version: '1.0.0' },
      libraries: [],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    ctx.clock,
  );
  let screenId = '';
  doc = applyCommand(
    doc,
    addScreen(
      {
        name: 'S',
        root: { package: 'react-native', component: 'View', version: '0.0.0-test' },
        initialStates: ['loading', 'success'],
      },
      (id) => {
        screenId = id;
      },
    ),
    ctx,
  ).document;
  return { ctx, doc, screenId };
}

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof RnjbError ? error.code : 'other';
  }
  return 'none';
};

describe('screen state commands', () => {
  it('adds, renames and removes states, keeping samples', () => {
    const { ctx, doc, screenId } = setup();
    let created = '';
    let next = applyCommand(
      doc,
      addState(screenId, 'emptyList', (id) => (created = id)),
      ctx,
    ).document;
    next = applyCommand(next, setStateSample(screenId, created, { items: [] }), ctx).document;
    next = applyCommand(next, renameState(screenId, created, 'noItems'), ctx).document;
    expect(next.screens[0]!.states.map((state) => state.name)).toEqual([
      'loading',
      'success',
      'noItems',
    ]);
    expect(next.screens[0]!.states[2]!.sample).toEqual({ items: [] });

    next = applyCommand(next, removeState(screenId, created), ctx).document;
    expect(next.screens[0]!.states.map((state) => state.name)).toEqual(['loading', 'success']);
  });

  it('rejects invalid and duplicate names (case-insensitive) with RNJB-606', () => {
    const { ctx, doc, screenId } = setup();
    for (const name of ['', 'Loading', '1abc', 'with space', 'a-b', 'x'.repeat(41)]) {
      expect(codeOf(() => applyCommand(doc, addState(screenId, name), ctx))).toBe('RNJB-606');
    }
    expect(codeOf(() => applyCommand(doc, addState(screenId, 'loading'), ctx))).toBe('RNJB-606');
    const first = doc.screens[0]!.states[0]!.id;
    expect(codeOf(() => applyCommand(doc, renameState(screenId, first, 'success'), ctx))).toBe(
      'RNJB-606',
    );
    // Renaming a state to its own name is not a duplicate.
    expect(codeOf(() => applyCommand(doc, renameState(screenId, first, 'loading'), ctx))).toBe(
      'none',
    );
  });

  it('reports unknown states with RNJB-602', () => {
    const { ctx, doc, screenId } = setup();
    expect(codeOf(() => applyCommand(doc, removeState(screenId, 'nope'), ctx))).toBe('RNJB-602');
    expect(codeOf(() => applyCommand(doc, renameState(screenId, 'nope', 'ok'), ctx))).toBe(
      'RNJB-602',
    );
  });

  it('exposes the name pattern', () => {
    expect(STATE_NAME_PATTERN.test('emptyList')).toBe(true);
    expect(STATE_NAME_PATTERN.test('Empty')).toBe(false);
  });
});
