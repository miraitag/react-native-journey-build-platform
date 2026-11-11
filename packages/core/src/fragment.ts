import type { Draft } from 'immer';
import { insertNode, type Command } from './commands.ts';
import type { ComponentRef, DocumentNode, RnjbDocument, Screen } from './entities.ts';
import { RnjbError } from './errors.ts';

/**
 * Nodes taken out of a screen to copy, duplicate or save as a block (§10.3, §7.5): the top-most
 * selected nodes, in tree order, plus every node of their subtrees. Ids are the original ones;
 * inserting a fragment always assigns fresh ids.
 */
export interface NodeFragment {
  rootIds: string[];
  nodes: Record<string, DocumentNode>;
  /** Texts the nodes point to, so a paste into another journey keeps them (§9.4). */
  strings?: Record<string, string>;
}

/** The fragment plus the `strings` entries its `string` props use. */
export function withStrings(
  fragment: NodeFragment,
  strings: Readonly<Record<string, string>>,
): NodeFragment {
  const used: Record<string, string> = {};
  for (const node of Object.values(fragment.nodes)) {
    if (node.kind !== 'component') continue;
    for (const value of Object.values(node.props)) {
      const text = value.type === 'string' ? strings[value.key] : undefined;
      if (value.type === 'string' && text !== undefined) used[value.key] = text;
    }
  }
  return { ...fragment, strings: used };
}

/**
 * The fragment for `nodeIds`. A selected node inside another selected node travels with it; the
 * screen root and unknown ids are ignored. `undefined` when nothing is left.
 */
export function extractFragment(
  screen: Screen | Draft<Screen>,
  nodeIds: readonly string[],
): NodeFragment | undefined {
  const wanted = new Set(nodeIds.filter((id) => id !== screen.rootId));
  const rootIds: string[] = [];
  const nodes: Record<string, DocumentNode> = {};
  const walk = (id: string, inside: boolean) => {
    const node = screen.nodes[id] as DocumentNode | undefined;
    if (!node) return;
    const take = inside || wanted.has(id);
    if (take) nodes[id] = JSON.parse(JSON.stringify(node)) as DocumentNode;
    if (take && !inside) rootIds.push(id);
    for (const child of node.children) walk(child, take);
  };
  walk(screen.rootId, false);
  return rootIds.length > 0 ? { rootIds, nodes } : undefined;
}

function screenOf(draft: Draft<RnjbDocument>, screenId: string): Draft<Screen> {
  const screen = draft.screens.find((candidate) => candidate.id === screenId);
  if (!screen) throw new RnjbError('RNJB-602', { screenId });
  return screen;
}

function fragmentOf(screen: Draft<Screen>, nodeIds: readonly string[]): NodeFragment {
  const fragment = extractFragment(screen, nodeIds);
  if (!fragment) throw new RnjbError('RNJB-601', { nodeId: nodeIds.join(', ') });
  return fragment;
}

const parentIdOf = (screen: Draft<Screen>, nodeId: string): string =>
  Object.values(screen.nodes).find((node) => node.children.includes(nodeId))?.id ?? screen.rootId;

/** Inserts a copied fragment at `index` of `parentId`, roots side by side, with fresh ids. */
export const insertFragment =
  (
    screenId: string,
    parentId: string,
    index: number,
    fragment: NodeFragment,
    onCreated?: (nodeIds: string[]) => void,
  ): Command =>
  (draft, context) => {
    // A text already in the journey wins: pasting never rewrites the target's strings.
    for (const [key, text] of Object.entries(fragment.strings ?? {})) draft.strings[key] ??= text;
    const created: string[] = [];
    fragment.rootIds.forEach((rootId, offset) => {
      insertNode(
        {
          screenId,
          parentId,
          index: index + offset,
          node: fragment.nodes[rootId] as DocumentNode,
          subtree: fragment.nodes,
        },
        (id) => created.push(id),
      )(draft, context);
    });
    onCreated?.(created);
  };

/** Copies each selected node (with its subtree) right after itself. */
export const duplicateNodes =
  (
    screenId: string,
    nodeIds: readonly string[],
    onCreated?: (nodeIds: string[]) => void,
  ): Command =>
  (draft, context) => {
    const screen = screenOf(draft, screenId);
    const fragment = fragmentOf(screen, nodeIds);
    const created: string[] = [];
    for (const rootId of fragment.rootIds) {
      const parentId = parentIdOf(screen, rootId);
      const index = (screen.nodes[parentId]?.children.indexOf(rootId) ?? -1) + 1;
      insertFragment(
        screenId,
        parentId,
        index,
        { rootIds: [rootId], nodes: fragment.nodes },
        (ids) => created.push(...ids),
      )(draft, context);
    }
    onCreated?.(created);
  };

/**
 * Puts the selected nodes inside a new `container`, at the place of the first one. They must be
 * siblings, otherwise wrapping would change the tree in ways the user did not ask for.
 */
export const wrapNodes =
  (
    screenId: string,
    nodeIds: readonly string[],
    container: ComponentRef,
    onCreated?: (nodeId: string) => void,
  ): Command =>
  (draft, { ids }) => {
    const screen = screenOf(draft, screenId);
    const { rootIds } = fragmentOf(screen, nodeIds);
    const parentIds = new Set(rootIds.map((id) => parentIdOf(screen, id)));
    if (parentIds.size !== 1) throw new RnjbError('RNJB-610', {});
    const parent = screen.nodes[[...parentIds][0] as string] as Draft<DocumentNode>;
    const wrapped = new Set(rootIds);
    const index = parent.children.findIndex((child) => wrapped.has(child));
    const id = ids.next();
    screen.nodes[id] = {
      id,
      kind: 'component',
      ref: container,
      props: {},
      children: parent.children.filter((child) => wrapped.has(child)),
      layout: {},
      spacing: {},
    };
    parent.children = parent.children.filter((child) => !wrapped.has(child));
    parent.children.splice(index, 0, id);
    onCreated?.(id);
  };

/** The reverse of `wrapNodes`: the container's children take its place, and it is removed. */
export const unwrapNode =
  (screenId: string, nodeId: string, onDone?: (childIds: string[]) => void): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    const node = screen.nodes[nodeId];
    if (!node) throw new RnjbError('RNJB-601', { nodeId });
    if (screen.rootId === nodeId) throw new RnjbError('RNJB-604', { nodeId });
    const parent = screen.nodes[parentIdOf(screen, nodeId)] as Draft<DocumentNode>;
    const index = parent.children.indexOf(nodeId);
    const children = [...node.children];
    parent.children.splice(index, 1, ...children);
    delete screen.nodes[nodeId];
    draft.connections = draft.connections.filter(
      (connection) =>
        !(connection.fromScreenId === screenId && connection.triggerNodeId === nodeId),
    );
    onDone?.(children);
  };
