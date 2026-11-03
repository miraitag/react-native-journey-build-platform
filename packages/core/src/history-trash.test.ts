import { describe, expect, it } from 'vitest';
import {
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  insertNode,
  removeNode,
  removeScreen,
  renameScreen,
  type CommandContext,
} from './commands.ts';
import type { ComponentRef, RnjbDocument } from './entities.ts';
import { RnjbError } from './errors.ts';
import { HISTORY_LIMIT, emptyHistory, recordStep, redo, undo } from './history.ts';
import {
  captureNode,
  captureScreen,
  expiryOf,
  partitionExpired,
  remainingMs,
  restoreNode,
  restoreScreen,
} from './trash.ts';

const view: ComponentRef = { package: 'react-native', component: 'View', version: '0.0.0-test' };
const text: ComponentRef = { package: 'react-native', component: 'Text', version: '0.0.0-test' };

function context(): CommandContext {
  let counter = 0;
  return {
    ids: { next: () => `id${++counter}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
}

function setup() {
  const ctx = context();
  let document: RnjbDocument = createDocument(
    {
      kind: 'journey',
      name: 'Transfers',
      slug: 'transfers',
      profile: { id: 'test-profile', version: '1.0.0' },
      libraries: [],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    ctx.clock,
  );
  const screens: string[] = [];
  for (const name of ['Home', 'Detail']) {
    document = applyCommand(
      document,
      addScreen({ name, root: view, position: { x: screens.length * 500, y: 0 } }, (id) =>
        screens.push(id),
      ),
      ctx,
    ).document;
  }
  const [home, detail] = screens as [string, string];
  const rootId = document.screens[0]?.rootId as string;
  let buttonId = '';
  document = applyCommand(
    document,
    insertNode(
      {
        screenId: home,
        parentId: rootId,
        node: {
          id: 'tmp',
          kind: 'component',
          ref: view,
          props: {},
          children: ['tmp-child'],
          layout: {},
          spacing: {},
        },
        subtree: {
          'tmp-child': {
            id: 'tmp-child',
            kind: 'component',
            ref: text,
            props: {},
            children: [],
            layout: {},
            spacing: {},
          },
        },
      },
      (id) => (buttonId = id),
    ),
    ctx,
  ).document;
  document = applyCommand(
    document,
    addConnection({ fromScreenId: home, triggerNodeId: buttonId, toScreenId: detail, params: [] }),
    ctx,
  ).document;
  return { ctx, document, home, detail, rootId, buttonId };
}

describe('history', () => {
  it('undoes and redoes a step, restoring the exact document', () => {
    const { ctx, document, home } = setup();
    const result = applyCommand(document, renameScreen(home, 'Inicio'), ctx);
    const history = recordStep(emptyHistory(), result);

    const back = undo(result.document, history);
    expect(back?.document).toEqual(document);
    expect(back?.history.past).toHaveLength(0);
    expect(back?.history.future).toHaveLength(1);

    const forward = back && redo(back.document, back.history);
    expect(forward?.document).toEqual(result.document);
    expect(forward?.applied).toBe(result.patches);
  });

  it('drops the redo branch on a new edit and ignores empty steps', () => {
    const { ctx, document, home } = setup();
    const first = applyCommand(document, renameScreen(home, 'A'), ctx);
    let history = recordStep(emptyHistory(), first);
    history = undo(first.document, history)?.history ?? history;
    expect(history.future).toHaveLength(1);
    history = recordStep(history, applyCommand(document, renameScreen(home, 'B'), ctx));
    expect(history.future).toHaveLength(0);
    expect(recordStep(history, { patches: [], inversePatches: [] })).toBe(history);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps`, () => {
    const { ctx, document, home } = setup();
    let current = document;
    let history = emptyHistory();
    for (let step = 0; step < HISTORY_LIMIT + 5; step++) {
      const result = applyCommand(current, renameScreen(home, `Name ${step}`), ctx);
      current = result.document;
      history = recordStep(history, result);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(undo(document, emptyHistory())).toBeUndefined();
    expect(redo(document, emptyHistory())).toBeUndefined();
  });
});

describe('trash', () => {
  it('restores a removed node subtree in place, with its navigation', () => {
    const { ctx, document, home, rootId, buttonId } = setup();
    const payload = captureNode(document, home, buttonId);
    expect(Object.keys(payload.nodes)).toHaveLength(2);
    expect(payload.connections).toHaveLength(1);

    const removed = applyCommand(document, removeNode(home, buttonId), ctx).document;
    expect(removed.connections).toHaveLength(0);

    const restored = applyCommand(removed, restoreNode(payload), ctx).document;
    expect(restored.screens[0]?.nodes).toEqual(document.screens[0]?.nodes);
    expect(restored.screens[0]?.nodes[rootId]?.children).toEqual([buttonId]);
    expect(restored.connections).toEqual(document.connections);
  });

  it('refuses to restore something that is already back', () => {
    const { ctx, document, home, buttonId } = setup();
    const payload = captureNode(document, home, buttonId);
    expect(() => applyCommand(document, restoreNode(payload), ctx)).toThrow(RnjbError);
    expect(() => captureNode(document, home, document.screens[0]?.rootId as string)).toThrow(
      RnjbError,
    );
  });

  it('restores a removed screen with position, initial flag and links', () => {
    const { ctx, document, home } = setup();
    const payload = captureScreen(document, home);
    expect(payload.wasInitial).toBe(true);
    const removed = applyCommand(document, removeScreen(home), ctx).document;
    expect(removed.board.initialScreenId).not.toBe(home);

    const restored = applyCommand(removed, restoreScreen(payload), ctx).document;
    expect(restored.screens.map((screen) => screen.id)).toEqual(
      document.screens.map((screen) => screen.id),
    );
    expect(restored.board).toEqual(document.board);
    expect(restored.connections).toEqual(document.connections);
    expect(() => applyCommand(restored, restoreScreen(payload), ctx)).toThrow(RnjbError);
  });

  it('computes expiry and splits expired items', () => {
    const deletedAt = '2026-01-01T00:00:00.000Z';
    const item = { expiresAt: expiryOf(deletedAt, 48) };
    expect(item.expiresAt).toBe('2026-01-03T00:00:00.000Z');
    const start = Date.parse(deletedAt);
    expect(remainingMs(item, start)).toBe(48 * 3_600_000);
    expect(partitionExpired([item], start + 47 * 3_600_000).alive).toHaveLength(1);
    expect(partitionExpired([item], start + 48 * 3_600_000).expired).toHaveLength(1);
    expect(expiryOf(deletedAt, 24)).toBe('2026-01-02T00:00:00.000Z');
  });
});
