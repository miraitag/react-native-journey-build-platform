import { describe, expect, it } from 'vitest';
import {
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  duplicateScreen,
  insertNode,
  setConnectionParams,
  setConnectionTarget,
  type CommandContext,
} from './commands.ts';
import { RnjbError } from './errors.ts';

function setup() {
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  const ref = { package: 'react-native', component: 'View', version: '0.0.0-test' };
  let a = '';
  let b = '';
  let doc = createDocument(
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
  doc = applyCommand(
    doc,
    addScreen({ name: 'A', root: ref, initialStates: ['success'] }, (id) => (a = id)),
    ctx,
  ).document;
  doc = applyCommand(
    doc,
    addScreen({ name: 'B', root: ref }, (id) => (b = id)),
    ctx,
  ).document;
  return { ctx, doc, a, b, ref };
}

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof RnjbError ? error.code : 'other';
  }
  return 'none';
};

describe('duplicateScreen', () => {
  it('copies the tree and states with fresh ids, right after the original', () => {
    const { ctx, doc, a, ref } = setup();
    const rootId = doc.screens[0]!.rootId;
    let child = '';
    let next = applyCommand(
      doc,
      insertNode(
        {
          screenId: a,
          parentId: rootId,
          node: {
            id: 'new',
            kind: 'component',
            ref,
            props: { title: { type: 'literal', value: 'x' } },
            children: [],
            layout: {},
            spacing: {},
          },
        },
        (id) => (child = id),
      ),
      ctx,
    ).document;
    let copyId = '';
    next = applyCommand(
      next,
      duplicateScreen(a, 'A copia', { x: 500, y: 0 }, (id) => (copyId = id)),
      ctx,
    ).document;

    expect(next.screens.map((screen) => screen.name)).toEqual(['A', 'A copia', 'B']);
    const original = next.screens[0]!;
    const copy = next.screens[1]!;
    expect(copy.id).toBe(copyId);
    expect(Object.keys(copy.nodes)).toHaveLength(2);
    expect(Object.keys(copy.nodes).some((id) => id in original.nodes)).toBe(false);
    expect(copy.nodes[copy.rootId]?.children).toHaveLength(1);
    expect(copy.nodes[copy.rootId]?.children[0]).not.toBe(child);
    expect(copy.states.map((state) => state.name)).toEqual(['success']);
    expect(copy.states[0]!.id).not.toBe(original.states[0]!.id);
    expect(next.board.positions[copyId]).toEqual({ x: 500, y: 0 });
    // The original is untouched and the copy is not the initial screen.
    expect(original.nodes[original.rootId]?.children).toEqual([child]);
    expect(next.board.initialScreenId).toBe(a);
  });

  it('rejects unknown screens with RNJB-602', () => {
    const { ctx, doc } = setup();
    expect(codeOf(() => applyCommand(doc, duplicateScreen('nope', 'x'), ctx))).toBe('RNJB-602');
  });
});

describe('connection edits', () => {
  it('retargets a connection and replaces its params', () => {
    const { ctx, doc, a, b } = setup();
    let next = applyCommand(
      doc,
      addConnection({ fromScreenId: a, toScreenId: b, params: [] }),
      ctx,
    ).document;
    const id = next.connections[0]!.id;
    next = applyCommand(next, setConnectionTarget(id, a), ctx).document;
    next = applyCommand(
      next,
      setConnectionParams(id, [{ name: 'userId', type: 'string', optional: true }]),
      ctx,
    ).document;
    expect(next.connections[0]).toMatchObject({
      toScreenId: a,
      params: [{ name: 'userId', type: 'string', optional: true }],
    });
  });

  it('reports unknown connections (RNJB-607) and screens (RNJB-602)', () => {
    const { ctx, doc, a, b } = setup();
    expect(codeOf(() => applyCommand(doc, setConnectionTarget('nope', a), ctx))).toBe('RNJB-607');
    expect(codeOf(() => applyCommand(doc, setConnectionParams('nope', []), ctx))).toBe('RNJB-607');
    const next = applyCommand(
      doc,
      addConnection({ fromScreenId: a, toScreenId: b, params: [] }),
      ctx,
    ).document;
    const id = next.connections[0]!.id;
    expect(codeOf(() => applyCommand(next, setConnectionTarget(id, 'gone'), ctx))).toBe('RNJB-602');
  });
});
