import { toast } from 'sonner';
import {
  duplicateNodes,
  extractFragment,
  moveScreenOnBoard,
  unwrapNode,
  withStrings,
  type Command,
  type NodeFragment,
  type Screen,
} from '@rnjb/core';
import { currentTranslator } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { canEdit, useTabs, type DocumentTab } from '../app/tabs-store.ts';
import { useLibraries } from '../services/library-store.ts';
import { moveNodeCommand, pasteCommand, wrapCommand } from './insert-component.ts';
import { trashNode } from '../app/trash.ts';
import { navigateSelection, selectionOf, type SelectionMove } from './selection.ts';

export { selectionOf };

/**
 * Node clipboard shared by every tab of this window, so nodes can be copied between screens,
 * tabs and journeys (§10.3).
 * shortcut: lives in memory, so it does not reach another browser window; move it to
 * `navigator.clipboard` as JSON if that is needed.
 */
let clipboard: NodeFragment | undefined;

function editing(tabId: string): { tab: DocumentTab; screen: Screen } | undefined {
  const tab = useTabs.getState().tabs.find((candidate) => candidate.id === tabId);
  const screen = tab?.document?.screens.find((item) => item.id === tab.view.selectedScreenId);
  return tab && screen && canEdit(tab) ? { tab, screen } : undefined;
}

/** Like `editing`, but read-only tabs can still move their selection. */
function viewing(tabId: string): { tab: DocumentTab; screen: Screen } | undefined {
  const tab = useTabs.getState().tabs.find((candidate) => candidate.id === tabId);
  const screen = tab?.document?.screens.find((item) => item.id === tab.view.selectedScreenId);
  return tab && screen ? { tab, screen } : undefined;
}

const select = (tabId: string, ids: readonly string[]) =>
  useTabs.getState().updateView(tabId, { selectedNodeId: ids[0], extraNodeIds: ids.slice(1) });

/** Runs a command and reports a refused one, never throwing at the keyboard handler. */
function apply(tabId: string, command: Command) {
  try {
    useTabs.getState().apply(tabId, command);
  } catch (error) {
    reportError(error);
  }
}

export function copySelection(tabId: string): boolean {
  const current = editing(tabId);
  if (!current) return false;
  const fragment = extractFragment(current.screen, selectionOf(current.tab.view));
  if (!fragment) return false;
  clipboard = withStrings(fragment, current.tab.document?.strings ?? {});
  toast.success(
    currentTranslator().t('editor.nodes.copied', { count: String(fragment.rootIds.length) }),
  );
  return true;
}

export function pasteClipboard(tabId: string): boolean {
  const current = editing(tabId);
  if (!current || !clipboard) return false;
  const packs = useLibraries.getState().packs;
  const command = pasteCommand(
    current.screen,
    packs,
    clipboard,
    current.tab.view.selectedNodeId,
    (ids) => select(tabId, ids),
  );
  if (command) apply(tabId, command);
  else toast.error(currentTranslator().t('editor.catalog.cannotNest'));
  return true;
}

export function duplicateSelection(tabId: string): boolean {
  const current = editing(tabId);
  const ids = current ? selectionOf(current.tab.view) : [];
  if (!current || ids.length === 0) return false;
  apply(
    tabId,
    duplicateNodes(current.screen.id, ids, (created) => select(tabId, created)),
  );
  return true;
}

export function wrapSelection(tabId: string): boolean {
  const current = editing(tabId);
  const fragment = current && extractFragment(current.screen, selectionOf(current.tab.view));
  if (!current || !fragment) return false;
  const command = wrapCommand(
    current.screen,
    useLibraries.getState().packs,
    fragment.rootIds,
    (id) => select(tabId, [id]),
  );
  if (command) apply(tabId, command);
  else toast.error(currentTranslator().t('editor.catalog.cannotNest'));
  return true;
}

/** Moves the selected node one place up or down among its siblings, if the rules allow it. */
export function moveSelection(tabId: string, delta: -1 | 1): boolean {
  const current = editing(tabId);
  const nodeId = current?.tab.view.selectedNodeId;
  if (!current || !nodeId || (current.tab.view.extraNodeIds ?? []).length > 0) return false;
  const { screen } = current;
  const siblings = Object.values(screen.nodes).find((node) =>
    node.children.includes(nodeId),
  )?.children;
  const sibling = siblings?.[siblings.indexOf(nodeId) + delta];
  if (!sibling) return true;
  const command = moveNodeCommand(
    screen,
    useLibraries.getState().packs,
    nodeId,
    sibling,
    delta < 0 ? 'before' : 'after',
  );
  if (command) apply(tabId, command);
  return true;
}

/** Esc / ⇧Enter, Enter, Tab / ⇧Tab and ⌘A: moves the selection through the tree. */
export function navigate(tabId: string, move: SelectionMove): boolean {
  const current = viewing(tabId);
  const next = current && navigateSelection(current.screen, current.tab.view, move);
  if (!next) return false;
  useTabs.getState().updateView(tabId, next);
  return true;
}

/** Tab / ⇧Tab with no node selected: the next or previous screen of the journey. */
export function selectScreenBy(tabId: string, delta: -1 | 1): boolean {
  const tab = useTabs.getState().tabs.find((candidate) => candidate.id === tabId);
  const screens = tab?.document?.screens ?? [];
  if (!tab || screens.length < 2) return false;
  const index = screens.findIndex((screen) => screen.id === tab.view.selectedScreenId);
  const screen = screens[(index + delta + screens.length) % screens.length];
  useTabs.getState().updateView(tabId, {
    selectedScreenId: screen?.id,
    selectedNodeId: undefined,
    extraNodeIds: [],
    stateId: screen?.states[0]?.id,
  });
  return true;
}

export function cutSelection(tabId: string): boolean {
  const current = editing(tabId);
  const fragment = current && extractFragment(current.screen, selectionOf(current.tab.view));
  if (!current || !fragment || !copySelection(tabId)) return false;
  for (const id of fragment.rootIds) void trashNode(tabId, current.screen.id, id);
  return true;
}

/** ⌘⇧G: the selected container is replaced by its children, which stay selected. */
export function unwrapSelection(tabId: string): boolean {
  const current = editing(tabId);
  const nodeId = current?.tab.view.selectedNodeId;
  if (!current || !nodeId || nodeId === current.screen.rootId) return false;
  apply(
    tabId,
    unwrapNode(current.screen.id, nodeId, (children) => select(tabId, children)),
  );
  return true;
}

/** Arrow keys with a screen (and no node) selected move it on the canvas. */
export function nudgeScreen(tabId: string, dx: number, dy: number): boolean {
  const current = editing(tabId);
  if (!current || current.tab.view.selectedNodeId) return false;
  const position = current.tab.document?.board.positions[current.screen.id] ?? { x: 0, y: 0 };
  apply(tabId, moveScreenOnBoard(current.screen.id, { x: position.x + dx, y: position.y + dy }));
  return true;
}
