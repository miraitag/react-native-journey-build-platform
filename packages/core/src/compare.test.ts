import { describe, expect, it } from 'vitest';
import { compareDocuments } from './compare.ts';
import {
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  type CommandContext,
} from './commands.ts';
import type { RnjbDocument } from './entities.ts';

describe('compareDocuments', () => {
  const root = { package: 'react-native', component: 'View', version: '0.0.0-test' };
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  const base = (): RnjbDocument =>
    createDocument(
      {
        kind: 'journey',
        name: 'Origen',
        slug: 'origen',
        profile: { id: 'test-profile', version: '1.0.0' },
        libraries: [],
        platformVersion: '0.0.0-test',
        formatVersion: 1,
      },
      ctx.clock,
    );
  const withScreen = (doc: RnjbDocument, name: string) =>
    applyCommand(doc, addScreen({ name, root, position: { x: 0, y: 0 } }), ctx).document;

  it('is identical to itself and ignores key order', () => {
    const doc = withScreen(base(), 'A');
    expect(compareDocuments(doc, JSON.parse(JSON.stringify(doc))).identical).toBe(true);
  });

  it('reports added, removed and changed screens by name', () => {
    const local = withScreen(withScreen(base(), 'A'), 'B');
    const [a] = local.screens;
    const remote: RnjbDocument = {
      ...local,
      screens: [
        ...local.screens.filter((screen) => screen.id !== local.screens[1]?.id),
        ...withScreen(base(), 'C').screens,
      ].map((screen) => (screen.id === a?.id ? { ...screen, name: 'A2' } : screen)),
    };
    const result = compareDocuments(local, remote);
    expect(result.screens).toEqual({ added: ['C'], removed: ['B'], changed: ['A2'] });
    expect(result.identical).toBe(false);
  });

  it('reports connections and sections that changed', () => {
    const local = withScreen(withScreen(base(), 'A'), 'B');
    const [a, b] = local.screens;
    const connected = applyCommand(
      local,
      addConnection({ fromScreenId: a?.id ?? '', toScreenId: b?.id ?? '', params: [] }),
      ctx,
    ).document;
    const result = compareDocuments(local, { ...connected, strings: { k: 'v' } });
    expect(result.connections.added).toBe(1);
    expect(result.sections).toEqual(['strings']);
  });

  it('does not count board positions as a difference', () => {
    const doc = withScreen(base(), 'A');
    const moved = { ...doc, board: { ...doc.board, positions: { x: { x: 9, y: 9 } } } };
    expect(compareDocuments(doc, moved).identical).toBe(true);
  });
});
