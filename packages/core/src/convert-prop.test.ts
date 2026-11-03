import { describe, expect, it } from 'vitest';
import {
  addScreen,
  applyCommand,
  convertPropToString,
  createDocument,
  setProp,
  type CommandContext,
} from './commands.ts';
import { RnjbError } from './errors.ts';

const ctx: CommandContext = {
  ids: { next: () => 'id1' },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};

function setup() {
  const base = createDocument(
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
  const ref = { package: 'react-native', component: 'View', version: '0.0.0-test' };
  const document = applyCommand(base, addScreen({ name: 'S', root: ref }), ctx).document;
  const screen = document.screens[0]!;
  return { document, screenId: screen.id, rootId: screen.rootId };
}

describe('convertPropToString', () => {
  it('stores the text under a node-derived key and points the prop at it', () => {
    const { document, screenId, rootId } = setup();
    const withLiteral = applyCommand(
      document,
      setProp(screenId, rootId, 'title', { type: 'literal', value: 'x' }),
      ctx,
    ).document;
    const next = applyCommand(
      withLiteral,
      convertPropToString(screenId, rootId, 'title', 'Hola'),
      ctx,
    ).document;
    const key = `${rootId}.title`;
    expect(next.strings[key]).toBe('Hola');
    const root = next.screens[0]!.nodes[rootId];
    expect(root?.kind === 'component' && root.props['title']).toEqual({ type: 'string', key });
  });

  it('rejects unknown nodes with RNJB-601', () => {
    const { document, screenId } = setup();
    expect(() =>
      applyCommand(document, convertPropToString(screenId, 'nope', 'title', 'x'), ctx),
    ).toThrow(RnjbError);
  });
});
