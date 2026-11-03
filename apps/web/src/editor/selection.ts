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
