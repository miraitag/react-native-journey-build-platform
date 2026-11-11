import type { Screen } from '@rnjb/core';
import type { ViewState } from '../app/tabs-store.ts';

/** Selected node ids of the tab: the primary one first. */
export const selectionOf = (view: ViewState): string[] =>
  view.selectedNodeId ? [view.selectedNodeId, ...(view.extraNodeIds ?? [])] : [];

/** Selection after a click: Shift adds or removes the node; a plain click selects only it. */
export function nextSelection(
  view: ViewState,
  screenId: string,
  nodeId: string | undefined,
  additive: boolean,
): Pick<ViewState, 'selectedNodeId' | 'extraNodeIds'> {
  if (!additive || !nodeId || screenId !== view.selectedScreenId || !view.selectedNodeId) {
    return { selectedNodeId: nodeId, extraNodeIds: [] };
  }
  const current = selectionOf(view);
  const next = current.includes(nodeId)
    ? current.filter((id) => id !== nodeId)
    : [...current, nodeId];
  return { selectedNodeId: next[0], extraNodeIds: next.slice(1) };
}

/** Keyboard moves of the selection, as in Figma: Esc/⇧Enter, Enter, Tab/⇧Tab and ⌘A. */
export type SelectionMove = 'parent' | 'children' | 'next' | 'previous' | 'siblings';

type NodeSelection = Pick<ViewState, 'selectedNodeId' | 'extraNodeIds'>;

const pick = (ids: readonly string[]): NodeSelection => ({
  selectedNodeId: ids[0],
  extraNodeIds: ids.slice(1),
});

/**
 * Where a keyboard move takes the selection inside `screen`; `undefined` when it goes nowhere
 * (e.g. Enter on a leaf). With no node selected the screen itself is the selection, so Enter and
 * ⌘A pick the root's children.
 */
export function navigateSelection(
  screen: Screen,
  view: ViewState,
  move: SelectionMove,
): NodeSelection | undefined {
  const current = view.selectedNodeId;
  const parentOf = (id: string) =>
    Object.values(screen.nodes).find((node) => node.children.includes(id))?.id;
  if (!current || !screen.nodes[current]) {
    const top = screen.nodes[screen.rootId]?.children ?? [];
    return move === 'children' || move === 'siblings'
      ? top.length
        ? pick(top)
        : undefined
      : undefined;
  }
  const parent = parentOf(current);
  const siblings = parent ? (screen.nodes[parent]?.children ?? []) : [];
  switch (move) {
    case 'parent':
      // Above the root there is only the screen: the node selection is cleared.
      return parent ? pick([parent]) : pick([]);
    case 'children': {
      const children = screen.nodes[current]?.children ?? [];
      return children.length ? pick(children) : undefined;
    }
    case 'siblings':
      return siblings.length
        ? pick([current, ...siblings.filter((id) => id !== current)])
        : undefined;
    case 'next':
    case 'previous': {
      if (siblings.length < 2) return undefined;
      const step = move === 'next' ? 1 : -1;
      const index = (siblings.indexOf(current) + step + siblings.length) % siblings.length;
      return pick([siblings[index] as string]);
    }
  }
}
