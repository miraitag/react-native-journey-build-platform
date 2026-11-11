import { addConnection, type Command } from './commands.ts';
import type { RnjbDocument } from './entities.ts';
import { RnjbError } from './errors.ts';

/** One row of the journey's flow as a tree: screens nest under the screen that navigates to them. */
export interface FlowRow {
  screenId: string;
  depth: number;
  /** The screen this row hangs from; absent for a top-level screen. */
  parentId?: string;
  /** Name of the element that triggers the navigation from the parent, when it has one. */
  trigger?: string;
  /**
   * A screen already shown higher up (another way in, or a loop back): drawn as a link to it,
   * not expanded again.
   */
  reference: boolean;
}

/**
 * The flow as a tree (Android's navigation graph, read as an outline): from the initial screen,
 * each screen lists the screens it navigates to, in the order the navigations were added. A
 * screen reached twice, or a loop, appears again only as a reference. The initial screen and
 * screens nothing navigates to start their own branch, in document order.
 */
export function flowTree(document: RnjbDocument): FlowRow[] {
  const byId = new Map(document.screens.map((screen) => [screen.id, screen]));
  const rows: FlowRow[] = [];
  const shown = new Set<string>();
  const triggerName = (screenId: string, nodeId: string | undefined): string | undefined => {
    const node = nodeId ? byId.get(screenId)?.nodes[nodeId] : undefined;
    if (!node) return undefined;
    return node.name ?? (node.kind === 'component' ? node.ref.component : undefined);
  };
  const visit = (screenId: string, depth: number, parentId?: string, trigger?: string) => {
    const reference = shown.has(screenId);
    rows.push({
      screenId,
      depth,
      ...(parentId ? { parentId } : {}),
      ...(trigger ? { trigger } : {}),
      reference,
    });
    if (reference) return;
    shown.add(screenId);
    const targets = new Set<string>();
    for (const connection of document.connections) {
      const target = connection.toScreenId;
      if (connection.fromScreenId !== screenId || target === screenId || targets.has(target))
        continue;
      if (!byId.has(target)) continue;
      targets.add(target);
      visit(target, depth + 1, screenId, triggerName(screenId, connection.triggerNodeId));
    }
  };
  // Roots: the initial screen and every screen nothing navigates to, in document order, so a
  // nested screen leaves the top level and the initial screen sits wherever it was moved.
  const initial = document.board.initialScreenId;
  const reached = new Set(
    document.connections
      .filter((c) => c.fromScreenId !== c.toScreenId && byId.has(c.fromScreenId))
      .map((c) => c.toScreenId),
  );
  const ids = document.screens.map((screen) => screen.id);
  for (const id of ids) if (id === initial || !reached.has(id)) if (!shown.has(id)) visit(id, 0);
  // Whatever is left only sits in loops nothing outside reaches.
  for (const id of ids) if (!shown.has(id)) visit(id, 0);
  return rows;
}

/**
 * Nests `screenId` under `parentId` in the flow, i.e. `parentId` navigates to it; `undefined`
 * takes it to the top level. Moving drops the navigations without a trigger that led to it from
 * elsewhere; navigations fired by an element are real code and are only removed in the
 * Inspector, never by a drag.
 */
export const nestScreen =
  (screenId: string, parentId: string | undefined): Command =>
  (draft, context) => {
    if (!draft.screens.some((screen) => screen.id === screenId)) {
      throw new RnjbError('RNJB-602', { screenId });
    }
    if (parentId === screenId) throw new RnjbError('RNJB-603', { nodeId: screenId });
    if (parentId && !draft.screens.some((screen) => screen.id === parentId)) {
      throw new RnjbError('RNJB-602', { screenId: parentId });
    }
    draft.connections = draft.connections.filter(
      (connection) =>
        connection.toScreenId !== screenId ||
        connection.triggerNodeId !== undefined ||
        connection.fromScreenId === parentId,
    );
    const linked = draft.connections.some(
      (connection) => connection.fromScreenId === parentId && connection.toScreenId === screenId,
    );
    if (parentId && !linked) {
      addConnection({ fromScreenId: parentId, toScreenId: screenId, params: [] })(draft, context);
    }
  };
