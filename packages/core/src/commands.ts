import { enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { validateCategories } from './categories.ts';
import type {
  BoardPosition,
  Category,
  ComponentRef,
  Connection,
  DocumentKind,
  DocumentNode,
  JsonValue,
  Layout,
  LibraryRef,
  ProfileRef,
  PropValue,
  RnjbDocument,
  Screen,
  SpacingValue,
} from './entities.ts';
import { RnjbError } from './errors.ts';
import type { ClockPort, IdPort } from './ports.ts';

enablePatches();

export interface CommandContext {
  ids: IdPort;
  clock: ClockPort;
}

/** A command mutates an Immer draft; it throws `RnjbError` when the operation is invalid. */
export type Command = (draft: Draft<RnjbDocument>, context: CommandContext) => void;

export interface CommandResult {
  document: RnjbDocument;
  patches: Patch[];
  inversePatches: Patch[];
}

export function applyCommand(
  document: RnjbDocument,
  command: Command,
  context: CommandContext,
): CommandResult {
  const [next, patches, inversePatches] = produceWithPatches(document, (draft) => {
    command(draft, context);
    draft.meta.updatedAt = context.clock.now();
  });
  return { document: next, patches, inversePatches };
}

export interface CreateDocumentInput {
  kind: DocumentKind;
  name: string;
  slug: string;
  profile: ProfileRef;
  libraries: LibraryRef[];
  platformVersion: string;
  formatVersion: number;
}

export function createDocument(input: CreateDocumentInput, clock: ClockPort): RnjbDocument {
  const now = clock.now();
  return {
    format: 'rnjb',
    formatVersion: input.formatVersion,
    meta: {
      kind: input.kind,
      name: input.name,
      slug: input.slug,
      createdAt: now,
      updatedAt: now,
      platformVersion: input.platformVersion,
    },
    libraries: input.libraries,
    profile: input.profile,
    screens: [],
    connections: [],
    forms: [],
    data: { models: [], gateways: [], blocks: [] },
    strings: {},
    assets: [],
    categories: [],
    board: { positions: {} },
    integrity: '',
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function screenOf(draft: Draft<RnjbDocument>, screenId: string): Draft<Screen> {
  const screen = draft.screens.find((candidate) => candidate.id === screenId);
  if (!screen) throw new RnjbError('RNJB-602', { screenId });
  return screen;
}

function nodeOf(screen: Draft<Screen>, nodeId: string): Draft<DocumentNode> {
  const node = screen.nodes[nodeId];
  if (!node) throw new RnjbError('RNJB-601', { nodeId });
  return node;
}

function parentOf(screen: Draft<Screen>, nodeId: string): Draft<DocumentNode> | undefined {
  return Object.values(screen.nodes).find((node) => node.children.includes(nodeId));
}

function descendantsOf(screen: Draft<Screen> | Screen, nodeId: string): string[] {
  const result: string[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    result.push(id);
    const node = screen.nodes[id];
    if (node) stack.push(...node.children);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Journey
// ---------------------------------------------------------------------------

export const renameJourney =
  (name: string): Command =>
  (draft) => {
    draft.meta.name = name;
  };

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export interface AddScreenInput {
  name: string;
  /** Root container; which component it is comes from the active packs, never from code. */
  root: ComponentRef;
  position?: BoardPosition;
  /** Initial states from the profile, e.g. loading/success/error/empty (§9.3). */
  initialStates?: readonly string[];
}

export const addScreen =
  (input: AddScreenInput, onCreated?: (screenId: string) => void): Command =>
  (draft, { ids }) => {
    const screenId = ids.next();
    const rootId = ids.next();
    draft.screens.push({
      id: screenId,
      name: input.name,
      rootId,
      nodes: {
        [rootId]: {
          id: rootId,
          kind: 'component',
          ref: input.root,
          props: {},
          children: [],
          layout: { flex: 1 },
          spacing: {},
        },
      },
      states: (input.initialStates ?? []).map((name) => ({ id: ids.next(), name, sample: {} })),
      logic: { hooks: [], blocks: [] },
    });
    draft.board.positions[screenId] = input.position ?? { x: 0, y: 0 };
    draft.board.initialScreenId ??= screenId;
    onCreated?.(screenId);
  };

/**
 * Copies a screen: nodes and states get fresh ids, the tree and sample data are kept. Connections
 * and forms belong to the original and are not copied; the copy starts a journey of its own.
 */
export const duplicateScreen =
  (
    screenId: string,
    name: string,
    position?: BoardPosition,
    onCreated?: (screenId: string) => void,
  ): Command =>
  (draft, { ids }) => {
    const source = screenOf(draft, screenId);
    const newId = ids.next();
    const mapped = new Map<string, string>();
    for (const id of Object.keys(source.nodes)) mapped.set(id, ids.next());
    const nodes: Record<string, DocumentNode> = {};
    for (const [id, node] of Object.entries(source.nodes)) {
      const clone = JSON.parse(JSON.stringify(node)) as DocumentNode;
      const nodeId = mapped.get(id) as string;
      nodes[nodeId] = {
        ...clone,
        id: nodeId,
        children: node.children.map((child) => mapped.get(child) as string),
      } as DocumentNode;
    }
    const index = draft.screens.findIndex((screen) => screen.id === screenId);
    draft.screens.splice(index + 1, 0, {
      id: newId,
      name,
      rootId: mapped.get(source.rootId) as string,
      nodes,
      states: source.states.map((state) => ({
        id: ids.next(),
        name: state.name,
        sample: JSON.parse(JSON.stringify(state.sample)) as typeof state.sample,
      })),
      logic: JSON.parse(JSON.stringify(source.logic)) as typeof source.logic,
    } as Draft<Screen>);
    draft.board.positions[newId] = position ?? { x: 0, y: 0 };
    onCreated?.(newId);
  };

export const renameScreen =
  (screenId: string, name: string): Command =>
  (draft) => {
    screenOf(draft, screenId).name = name;
  };

export const removeScreen =
  (screenId: string): Command =>
  (draft) => {
    const index = draft.screens.findIndex((screen) => screen.id === screenId);
    if (index < 0) throw new RnjbError('RNJB-602', { screenId });
    draft.screens.splice(index, 1);
    draft.connections = draft.connections.filter(
      (connection) => connection.fromScreenId !== screenId && connection.toScreenId !== screenId,
    );
    draft.forms = draft.forms.filter((form) => form.screenId !== screenId);
    delete draft.board.positions[screenId];
    if (draft.board.initialScreenId === screenId) {
      const first = draft.screens[0];
      if (first) draft.board.initialScreenId = first.id;
      else delete draft.board.initialScreenId;
    }
  };

export const setInitialScreen =
  (screenId: string): Command =>
  (draft) => {
    screenOf(draft, screenId);
    draft.board.initialScreenId = screenId;
  };

export const moveScreenOnBoard =
  (screenId: string, position: BoardPosition): Command =>
  (draft) => {
    screenOf(draft, screenId);
    draft.board.positions[screenId] = position;
  };

export const reorderScreen =
  (screenId: string, toIndex: number): Command =>
  (draft) => {
    const from = draft.screens.findIndex((screen) => screen.id === screenId);
    if (from < 0) throw new RnjbError('RNJB-602', { screenId });
    const [screen] = draft.screens.splice(from, 1);
    const target = Math.max(0, Math.min(toIndex, draft.screens.length));
    draft.screens.splice(target, 0, screen as Draft<Screen>);
  };

export const setStateSample =
  (screenId: string, stateId: string, sample: Record<string, JsonValue>): Command =>
  (draft) => {
    const state = screenOf(draft, screenId).states.find((candidate) => candidate.id === stateId);
    if (!state) throw new RnjbError('RNJB-602', { screenId, stateId });
    state.sample = sample;
  };

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** State names become members of the exported `UiState` union, so they must be identifiers. */
export const STATE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,39}$/;

const checkedStateName = (screen: Draft<Screen>, name: string, ignoreId?: string): string => {
  const taken = screen.states.some(
    (state) => state.id !== ignoreId && state.name.toLowerCase() === name.toLowerCase(),
  );
  if (!STATE_NAME_PATTERN.test(name) || taken) throw new RnjbError('RNJB-606', { name });
  return name;
};

export const addState =
  (screenId: string, name: string, onCreated?: (stateId: string) => void): Command =>
  (draft, { ids }) => {
    const screen = screenOf(draft, screenId);
    const id = ids.next();
    screen.states.push({ id, name: checkedStateName(screen, name), sample: {} });
    onCreated?.(id);
  };

export const renameState =
  (screenId: string, stateId: string, name: string): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    const state = screen.states.find((candidate) => candidate.id === stateId);
    if (!state) throw new RnjbError('RNJB-602', { screenId, stateId });
    state.name = checkedStateName(screen, name, stateId);
  };

export const removeState =
  (screenId: string, stateId: string): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    if (!screen.states.some((candidate) => candidate.id === stateId)) {
      throw new RnjbError('RNJB-602', { screenId, stateId });
    }
    screen.states = screen.states.filter((candidate) => candidate.id !== stateId);
  };

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface InsertNodeInput {
  screenId: string;
  parentId: string;
  index?: number;
  /** Node without id; ids for it and its subtree are assigned here. */
  node: DocumentNode;
  /** Optional subtree (e.g. a block) keyed by its original ids; copied with fresh ids. */
  subtree?: Record<string, DocumentNode>;
}

export const insertNode =
  (input: InsertNodeInput, onCreated?: (nodeId: string) => void): Command =>
  (draft, { ids }) => {
    const screen = screenOf(draft, input.screenId);
    const parent = nodeOf(screen, input.parentId);
    const source: Record<string, DocumentNode> = { ...input.subtree, [input.node.id]: input.node };
    const copy = (originalId: string): string => {
      const original = source[originalId];
      if (!original) throw new RnjbError('RNJB-601', { nodeId: originalId });
      const id = ids.next();
      const children = original.children.map(copy);
      const clone = JSON.parse(JSON.stringify(original)) as DocumentNode;
      screen.nodes[id] = { ...clone, id, children } as Draft<DocumentNode>;
      return id;
    };
    const newId = copy(input.node.id);
    const index = input.index ?? parent.children.length;
    parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, newId);
    onCreated?.(newId);
  };

export const removeNode =
  (screenId: string, nodeId: string): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    if (screen.rootId === nodeId) throw new RnjbError('RNJB-604', { nodeId });
    nodeOf(screen, nodeId);
    const parent = parentOf(screen, nodeId);
    if (parent) parent.children = parent.children.filter((child) => child !== nodeId);
    for (const id of descendantsOf(screen, nodeId)) delete screen.nodes[id];
    draft.connections = draft.connections.filter(
      (connection) =>
        !(connection.fromScreenId === screenId && connection.triggerNodeId === nodeId),
    );
  };

export const moveNode =
  (screenId: string, nodeId: string, newParentId: string, index: number): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    if (screen.rootId === nodeId) throw new RnjbError('RNJB-604', { nodeId });
    const newParent = nodeOf(screen, newParentId);
    if (descendantsOf(screen, nodeId).includes(newParentId)) {
      throw new RnjbError('RNJB-603', { nodeId, newParentId });
    }
    const oldParent = parentOf(screen, nodeId);
    if (oldParent) oldParent.children = oldParent.children.filter((child) => child !== nodeId);
    const target = Math.max(0, Math.min(index, newParent.children.length));
    newParent.children.splice(target, 0, nodeId);
  };

export const setProp =
  (screenId: string, nodeId: string, prop: string, value: PropValue | undefined): Command =>
  (draft) => {
    const node = nodeOf(screenOf(draft, screenId), nodeId);
    if (node.kind !== 'component') throw new RnjbError('RNJB-601', { nodeId });
    if (value === undefined) delete node.props[prop];
    else node.props[prop] = value;
  };

/**
 * Turns a prop into a document string (§9.5) in one step: the text is stored under a key derived
 * from the node and prop, and the prop points at it. The same key is reused if it already exists.
 */
export const convertPropToString =
  (screenId: string, nodeId: string, prop: string, text: string): Command =>
  (draft) => {
    const node = nodeOf(screenOf(draft, screenId), nodeId);
    if (node.kind !== 'component') throw new RnjbError('RNJB-601', { nodeId });
    const key = `${nodeId}.${prop}`;
    draft.strings[key] = text;
    node.props[prop] = { type: 'string', key };
  };

export const updateLayout =
  (screenId: string, nodeId: string, layout: Partial<Layout>): Command =>
  (draft) => {
    const node = nodeOf(screenOf(draft, screenId), nodeId);
    if (node.kind !== 'component') throw new RnjbError('RNJB-601', { nodeId });
    for (const [key, value] of Object.entries(layout) as [keyof Layout, Layout[keyof Layout]][]) {
      if (value === undefined) delete node.layout[key];
      else (node.layout as Record<string, unknown>)[key] = value;
    }
  };

// ---------------------------------------------------------------------------
// Connections, strings, categories
// ---------------------------------------------------------------------------

export type SpacingTarget =
  `${'margin' | 'padding'}.${'top' | 'right' | 'bottom' | 'left'}` | 'gap';

/** Sets (or clears, with `undefined`) one margin, padding or gap value of a node. */
export const setSpacing =
  (
    screenId: string,
    nodeId: string,
    target: SpacingTarget,
    value: SpacingValue | undefined,
  ): Command =>
  (draft) => {
    const node = nodeOf(screenOf(draft, screenId), nodeId);
    if (node.kind !== 'component') throw new RnjbError('RNJB-601', { nodeId });
    if (target === 'gap') {
      if (value === undefined) delete node.spacing.gap;
      else node.spacing.gap = value;
      return;
    }
    const [kind, side] = target.split('.') as [
      'margin' | 'padding',
      'top' | 'right' | 'bottom' | 'left',
    ];
    const group = (node.spacing[kind] ??= {});
    if (value === undefined) delete group[side];
    else group[side] = value;
    if (Object.keys(group).length === 0) delete node.spacing[kind];
  };

export const addConnection =
  (connection: Omit<Connection, 'id'>): Command =>
  (draft, { ids }) => {
    screenOf(draft, connection.fromScreenId);
    screenOf(draft, connection.toScreenId);
    draft.connections.push({ ...connection, id: ids.next() });
  };

function connectionOf(draft: Draft<RnjbDocument>, connectionId: string) {
  const connection = draft.connections.find((candidate) => candidate.id === connectionId);
  if (!connection) throw new RnjbError('RNJB-607', { connectionId });
  return connection;
}

export const setConnectionTarget =
  (connectionId: string, toScreenId: string): Command =>
  (draft) => {
    const connection = connectionOf(draft, connectionId);
    screenOf(draft, toScreenId);
    connection.toScreenId = toScreenId;
  };

export const setConnectionParams =
  (connectionId: string, params: Connection['params']): Command =>
  (draft) => {
    connectionOf(draft, connectionId).params = params.map((param) => ({ ...param }));
  };

export const removeConnection =
  (connectionId: string): Command =>
  (draft) => {
    draft.connections = draft.connections.filter((connection) => connection.id !== connectionId);
  };

export const setString =
  (key: string, value: string | undefined): Command =>
  (draft) => {
    if (value === undefined) delete draft.strings[key];
    else draft.strings[key] = value;
  };

export const addCategory =
  (category: Omit<Category, 'id'>): Command =>
  (draft, { ids }) => {
    const next = [...draft.categories, { ...category, id: ids.next() }];
    const valid = validateCategories(next);
    if (!valid.ok) throw valid.error;
    draft.categories.push(next[next.length - 1] as Category);
  };
