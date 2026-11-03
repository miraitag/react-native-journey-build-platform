import type { Draft } from 'immer';
import type { Command } from './commands.ts';
import type {
  BoardPosition,
  Connection,
  DocumentNode,
  Form,
  RnjbDocument,
  Screen,
} from './entities.ts';
import { RnjbError } from './errors.ts';

/** Trash (plan §18.4): deleted items keep a restorable copy until they expire. */

export type TrashRetentionHours = 24 | 48;

export interface NodeTrashPayload {
  screenId: string;
  parentId: string;
  index: number;
  nodeId: string;
  nodes: Record<string, DocumentNode>;
  connections: Connection[];
}

export interface ScreenTrashPayload {
  screen: Screen;
  index: number;
  position?: BoardPosition;
  wasInitial: boolean;
  connections: Connection[];
  forms: Form[];
}

export interface FileTrashPayload {
  /** Workspace-relative path of the `.rnjb`. */
  path: string;
  contents: string;
}

interface TrashBase {
  id: string;
  label: string;
  deletedAt: string;
  expiresAt: string;
}

export type TrashItem =
  | (TrashBase & { kind: 'node'; docKey: string; payload: NodeTrashPayload })
  | (TrashBase & { kind: 'screen'; docKey: string; payload: ScreenTrashPayload })
  | (TrashBase & { kind: 'journey' | 'template'; payload: FileTrashPayload });

export type TrashKind = TrashItem['kind'];

const HOUR = 3_600_000;

export const expiryOf = (deletedAt: string, hours: TrashRetentionHours): string =>
  new Date(Date.parse(deletedAt) + hours * HOUR).toISOString();

export const remainingMs = (item: Pick<TrashBase, 'expiresAt'>, now: number): number =>
  Math.max(0, Date.parse(item.expiresAt) - now);

export function partitionExpired<T extends Pick<TrashBase, 'expiresAt'>>(
  items: readonly T[],
  now: number,
): { expired: T[]; alive: T[] } {
  const expired: T[] = [];
  const alive: T[] = [];
  for (const item of items) (remainingMs(item, now) === 0 ? expired : alive).push(item);
  return { expired, alive };
}

/** Documents are plain JSON (§8), so a JSON round trip is a faithful deep copy. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function subtreeIds(screen: Screen, nodeId: string): string[] {
  const ids: string[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    const node = screen.nodes[id];
    if (!node) continue;
    ids.push(id);
    stack.push(...node.children);
  }
  return ids;
}

/** Copies a node subtree and its outgoing navigation before `removeNode` runs. */
export function captureNode(
  document: RnjbDocument,
  screenId: string,
  nodeId: string,
): NodeTrashPayload {
  const screen = document.screens.find((candidate) => candidate.id === screenId);
  if (!screen) throw new RnjbError('RNJB-602', { screenId });
  if (!screen.nodes[nodeId]) throw new RnjbError('RNJB-601', { nodeId });
  if (screen.rootId === nodeId) throw new RnjbError('RNJB-604', { nodeId });
  const parent = Object.values(screen.nodes).find((node) => node.children.includes(nodeId));
  const nodes: Record<string, DocumentNode> = {};
  for (const id of subtreeIds(screen, nodeId)) nodes[id] = clone(screen.nodes[id] as DocumentNode);
  return {
    screenId,
    parentId: parent?.id ?? screen.rootId,
    index: parent ? parent.children.indexOf(nodeId) : 0,
    nodeId,
    nodes,
    connections: clone(
      document.connections.filter(
        (connection) => connection.fromScreenId === screenId && connection.triggerNodeId === nodeId,
      ),
    ),
  };
}

/** Copies a screen with everything `removeScreen` drops along with it. */
export function captureScreen(document: RnjbDocument, screenId: string): ScreenTrashPayload {
  const index = document.screens.findIndex((candidate) => candidate.id === screenId);
  const screen = document.screens[index];
  if (!screen) throw new RnjbError('RNJB-602', { screenId });
  const position = document.board.positions[screenId];
  return {
    screen: clone(screen),
    index,
    ...(position ? { position: { ...position } } : {}),
    wasInitial: document.board.initialScreenId === screenId,
    connections: clone(
      document.connections.filter(
        (connection) => connection.fromScreenId === screenId || connection.toScreenId === screenId,
      ),
    ),
    forms: clone(document.forms.filter((form) => form.screenId === screenId)),
  };
}

const screenIds = (draft: Draft<RnjbDocument>) => new Set(draft.screens.map((screen) => screen.id));

function restoreConnections(draft: Draft<RnjbDocument>, connections: Connection[]): void {
  const screens = screenIds(draft);
  const existing = new Set(draft.connections.map((connection) => connection.id));
  for (const connection of connections) {
    if (existing.has(connection.id)) continue;
    if (!screens.has(connection.fromScreenId) || !screens.has(connection.toScreenId)) continue;
    draft.connections.push(clone(connection));
  }
}

/** Puts a node subtree back with its original ids; fails if it is already in the document. */
export const restoreNode =
  (payload: NodeTrashPayload): Command =>
  (draft) => {
    const screen = draft.screens.find((candidate) => candidate.id === payload.screenId);
    if (!screen) throw new RnjbError('RNJB-602', { screenId: payload.screenId });
    for (const id of Object.keys(payload.nodes)) {
      if (screen.nodes[id]) throw new RnjbError('RNJB-605', { id });
    }
    const parent = screen.nodes[payload.parentId] ?? screen.nodes[screen.rootId];
    if (!parent) throw new RnjbError('RNJB-601', { nodeId: payload.parentId });
    for (const [id, node] of Object.entries(payload.nodes)) {
      screen.nodes[id] = clone(node) as Draft<DocumentNode>;
    }
    const index = Math.max(0, Math.min(payload.index, parent.children.length));
    parent.children.splice(index, 0, payload.nodeId);
    restoreConnections(draft, payload.connections);
  };

/** Puts a screen back in its old place, with its board position, links and forms. */
export const restoreScreen =
  (payload: ScreenTrashPayload): Command =>
  (draft) => {
    if (draft.screens.some((screen) => screen.id === payload.screen.id)) {
      throw new RnjbError('RNJB-605', { id: payload.screen.id });
    }
    const index = Math.max(0, Math.min(payload.index, draft.screens.length));
    draft.screens.splice(index, 0, clone(payload.screen) as Draft<Screen>);
    if (payload.position) draft.board.positions[payload.screen.id] = { ...payload.position };
    if (payload.wasInitial || !draft.board.initialScreenId) {
      draft.board.initialScreenId = payload.screen.id;
    }
    const forms = new Set(draft.forms.map((form) => form.id));
    for (const form of payload.forms) if (!forms.has(form.id)) draft.forms.push(clone(form));
    restoreConnections(draft, payload.connections);
  };
