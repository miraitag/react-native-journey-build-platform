import { applyPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addConnection,
  addScreen,
  applyCommand,
  createDocument,
  insertNode,
  moveNode,
  removeNode,
  removeScreen,
  setProp,
  type CommandContext,
} from './commands.ts';
import type { ComponentRef, RnjbDocument } from './entities.ts';
import { RnjbError } from './errors.ts';

const view: ComponentRef = { package: 'react-native', component: 'View', version: '0.0.0-test' };
const text: ComponentRef = { package: 'react-native', component: 'Text', version: '0.0.0-test' };

function context(): CommandContext {
  let counter = 0;
  return {
    ids: { next: () => `id${++counter}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
}

function baseDocument(ctx: CommandContext): RnjbDocument {
  return createDocument(
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
}

function withScreen() {
  const ctx = context();
  let screenId = '';
  const { document } = applyCommand(
    baseDocument(ctx),
    addScreen({ name: 'Home', root: view, initialStates: ['loading', 'success'] }, (id) => {
      screenId = id;
    }),
    ctx,
  );
  return { ctx, document, screenId };
}

describe('commands', () => {
  it('adds a screen with its root and profile states, and marks it initial', () => {
    const { document, screenId } = withScreen();
    const screen = document.screens[0];
    expect(screen?.id).toBe(screenId);
    expect(screen?.states.map((state) => state.name)).toEqual(['loading', 'success']);
    expect(document.board.initialScreenId).toBe(screenId);
  });

  it('produces inverse patches that undo the command', () => {
    const { ctx, document, screenId } = withScreen();
    const root = document.screens[0]!.rootId;
    const result = applyCommand(
      document,
      insertNode({
        screenId,
        parentId: root,
        node: {
          id: 'tmp',
          kind: 'component',
          ref: text,
          props: {},
          children: [],
          layout: {},
          spacing: {},
        },
      }),
      ctx,
    );
    expect(Object.keys(result.document.screens[0]!.nodes)).toHaveLength(2);
    expect(applyPatches(result.document, result.inversePatches)).toEqual(document);
  });

  it('copies a subtree with fresh ids', () => {
    const { ctx, document, screenId } = withScreen();
    const root = document.screens[0]!.rootId;
    const { document: next } = applyCommand(
      document,
      insertNode({
        screenId,
        parentId: root,
        node: {
          id: 'a',
          kind: 'component',
          ref: view,
          props: {},
          children: ['b'],
          layout: {},
          spacing: {},
        },
        subtree: {
          b: {
            id: 'b',
            kind: 'component',
            ref: text,
            props: {},
            children: [],
            layout: {},
            spacing: {},
          },
        },
      }),
      ctx,
    );
    const ids = Object.keys(next.screens[0]!.nodes);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).toHaveLength(3);
  });

  it('removes a node with its descendants and its connections', () => {
    const { ctx, document, screenId } = withScreen();
    const root = document.screens[0]!.rootId;
    let nodeId = '';
    let doc = applyCommand(
      document,
      insertNode(
        {
          screenId,
          parentId: root,
          node: {
            id: 'a',
            kind: 'component',
            ref: view,
            props: {},
            children: ['b'],
            layout: {},
            spacing: {},
          },
          subtree: {
            b: {
              id: 'b',
              kind: 'component',
              ref: text,
              props: {},
              children: [],
              layout: {},
              spacing: {},
            },
          },
        },
        (id) => {
          nodeId = id;
        },
      ),
      ctx,
    ).document;
    doc = applyCommand(
      doc,
      addConnection({
        fromScreenId: screenId,
        toScreenId: screenId,
        triggerNodeId: nodeId,
        params: [],
      }),
      ctx,
    ).document;
    doc = applyCommand(doc, removeNode(screenId, nodeId), ctx).document;
    expect(Object.keys(doc.screens[0]!.nodes)).toEqual([root]);
    expect(doc.connections).toHaveLength(0);
  });

  it('refuses to remove the root or to move a node into its own subtree', () => {
    const { ctx, document, screenId } = withScreen();
    const root = document.screens[0]!.rootId;
    expect(() => applyCommand(document, removeNode(screenId, root), ctx)).toThrowError(RnjbError);
    let parent = '';
    const doc = applyCommand(
      document,
      insertNode(
        {
          screenId,
          parentId: root,
          node: {
            id: 'a',
            kind: 'component',
            ref: view,
            props: {},
            children: ['b'],
            layout: {},
            spacing: {},
          },
          subtree: {
            b: {
              id: 'b',
              kind: 'component',
              ref: view,
              props: {},
              children: [],
              layout: {},
              spacing: {},
            },
          },
        },
        (id) => {
          parent = id;
        },
      ),
      ctx,
    ).document;
    const child = doc.screens[0]!.nodes[parent]!.children[0]!;
    expect(() => applyCommand(doc, moveNode(screenId, parent, child, 0), ctx)).toThrowError(
      expect.objectContaining({ code: 'RNJB-603' }),
    );
  });

  it('sets and clears typed props', () => {
    const { ctx, document, screenId } = withScreen();
    const root = document.screens[0]!.rootId;
    let doc = applyCommand(
      document,
      setProp(screenId, root, 'testID', { type: 'literal', value: 'home' }),
      ctx,
    ).document;
    expect(doc.screens[0]!.nodes[root]).toMatchObject({
      props: { testID: { type: 'literal', value: 'home' } },
    });
    doc = applyCommand(doc, setProp(screenId, root, 'testID', undefined), ctx).document;
    expect(doc.screens[0]!.nodes[root]).toMatchObject({ props: {} });
  });

  it('removing the initial screen promotes the next one', () => {
    const { ctx, document, screenId } = withScreen();
    let second = '';
    let doc = applyCommand(
      document,
      addScreen({ name: 'Detail', root: view }, (id) => (second = id)),
      ctx,
    ).document;
    doc = applyCommand(doc, removeScreen(screenId), ctx).document;
    expect(doc.board.initialScreenId).toBe(second);
  });

  it('enforces the two-level category limit', () => {
    const ctx = context();
    let doc = baseDocument(ctx);
    doc = applyCommand(doc, addCategory({ name: 'Forms' }), ctx).document;
    const forms = doc.categories[0]!.id;
    doc = applyCommand(doc, addCategory({ name: 'Inputs', parentId: forms }), ctx).document;
    const inputs = doc.categories[1]!.id;
    expect(() =>
      applyCommand(doc, addCategory({ name: 'Deep', parentId: inputs }), ctx),
    ).toThrowError(expect.objectContaining({ code: 'RNJB-010' }));
  });
});
