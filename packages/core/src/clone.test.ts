import { describe, expect, it } from 'vitest';
import { cloneDocument } from './clone.ts';
import {
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  type CommandContext,
} from './commands.ts';

describe('cloneDocument', () => {
  const ref = { package: 'react-native', component: 'View', version: '0.0.0-test' };
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };

  const build = () => {
    let a = '';
    let b = '';
    let doc = createDocument(
      {
        kind: 'journey',
        name: 'Origen',
        slug: 'origen',
        profile: { id: 'test-profile', version: '1.0.0' },
        libraries: [{ package: 'p', version: '1.0.0', packId: 'pack' }],
        platformVersion: '0.0.0-test',
        formatVersion: 1,
      },
      ctx.clock,
    );
    doc = applyCommand(
      doc,
      addScreen(
        { name: 'A', root: ref, position: { x: 0, y: 0 }, initialStates: ['success'] },
        (id) => (a = id),
      ),
      ctx,
    ).document;
    doc = applyCommand(
      doc,
      addScreen({ name: 'B', root: ref, position: { x: 480, y: 0 } }, (id) => (b = id)),
      ctx,
    ).document;
    doc = applyCommand(
      doc,
      addConnection({ fromScreenId: a, toScreenId: b, params: [] }),
      ctx,
    ).document;
    return {
      doc: { ...doc, provenance: { remote: { remote: 'r', ref: 'main', path: 'p', commit: 'c' } } },
      a,
      b,
    };
  };

  it('replaces every id and keeps references consistent', () => {
    const { doc, a, b } = build();
    const copy = cloneDocument(
      doc,
      { kind: 'template', name: 'Plantilla', slug: 'plantilla' },
      ctx,
    );

    const [first, second] = copy.screens;
    expect(first?.id).not.toBe(a);
    expect(second?.id).not.toBe(b);
    expect(copy.connections[0]?.fromScreenId).toBe(first?.id);
    expect(copy.connections[0]?.toScreenId).toBe(second?.id);
    expect(copy.connections[0]?.id).not.toBe(doc.connections[0]?.id);
    expect(copy.board.initialScreenId).toBe(first?.id);
    expect(Object.keys(copy.board.positions)).toEqual([first?.id, second?.id]);
    expect(copy.board.positions[first?.id as string]).toEqual({ x: 0, y: 0 });

    const root = first?.nodes[first.rootId];
    expect(root?.id).toBe(first?.rootId);
    expect(first?.rootId).not.toBe(doc.screens[0]?.rootId);
    expect(first?.states[0]?.name).toBe('success');
  });

  it('sets the new identity, drops provenance and keeps profile and libraries', () => {
    const { doc } = build();
    const copy = cloneDocument(
      doc,
      { kind: 'template', name: 'Plantilla', slug: 'plantilla' },
      ctx,
    );
    expect(copy.meta).toMatchObject({ kind: 'template', name: 'Plantilla', slug: 'plantilla' });
    expect(copy.provenance).toBeUndefined();
    expect(copy.integrity).toBe('');
    expect(copy.profile).toEqual(doc.profile);
    expect(copy.libraries).toEqual(doc.libraries);
  });

  it('leaves the original untouched', () => {
    const { doc } = build();
    const before = JSON.stringify(doc);
    cloneDocument(doc, { kind: 'journey', name: 'X', slug: 'xyz' }, ctx);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
