import { create } from 'zustand';
import {
  applyCommand,
  emptyHistory,
  recordStep,
  redo as redoStep,
  undo as undoStep,
  type Command,
  type CommandContext,
  type DocumentKind,
  type History,
  type RnjbDocument,
  type SerializedRnjbError,
} from '@rnjb/core';
import type { Patch } from 'immer';
import type { TabSource } from '../services/db.ts';
import { documentHost } from '../services/document-client.ts';

export type { TabSource };

export interface ViewState {
  selectedScreenId: string | undefined;
  selectedNodeId: string | undefined;
  stateId: string | undefined;
  previewTheme: 'light' | 'dark';
  leftPanel: string;
  problemsOpen: boolean;
}

/**
 * One tab per document (§18.3). `id` doubles as the draft key. A tab is `unloaded` when its
 * document and history live only in the draft (more than 8 tabs, or right after a reload).
 */
export interface DocumentTab {
  id: string;
  source: TabSource;
  title: string;
  kind: DocumentKind;
  status: 'ready' | 'unloaded' | 'loading' | 'failed';
  document: RnjbDocument | undefined;
  history: History;
  mode: 'edit' | 'recovery';
  issues: SerializedRnjbError[];
  view: ViewState;
  /** Bumped on every change; the draft and the file record which revision they hold. */
  revision: number;
  draftRevision: number;
  /** -1 when the document has never been written to a file. */
  fileRevision: number;
  fileStatus: 'idle' | 'saving' | 'error';
  fileError: SerializedRnjbError | undefined;
  lastActive: number;
}

export const HOME_TAB = 'home';

export const isFileDirty = (tab: DocumentTab): boolean => tab.revision !== tab.fileRevision;
export const isDraftPending = (tab: DocumentTab): boolean => tab.draftRevision < tab.revision;
export const canEdit = (tab: DocumentTab): boolean =>
  tab.status === 'ready' && tab.mode === 'edit' && tab.document !== undefined;

export const sourceKey = (source: TabSource): string | undefined =>
  source.type === 'workspace' ? `ws:${source.path}` : undefined;

export const initialView = (document: RnjbDocument): ViewState => {
  const screen =
    document.screens.find((candidate) => candidate.id === document.board.initialScreenId) ??
    document.screens[0];
  return {
    selectedScreenId: screen?.id,
    selectedNodeId: undefined,
    stateId: screen?.states[0]?.id,
    previewTheme: 'light',
    leftPanel: 'screens',
    problemsOpen: false,
  };
};

const commandContext: CommandContext = {
  ids: { next: () => crypto.randomUUID() },
  clock: { now: () => new Date().toISOString() },
};

export interface OpenTabInput {
  id: string;
  source: TabSource;
  document: RnjbDocument;
  mode: 'edit' | 'recovery';
  issues: SerializedRnjbError[];
  /** False for documents that exist only in memory (no file yet). */
  onDisk: boolean;
}

export type UnloadedTabInput = Pick<DocumentTab, 'id' | 'source' | 'title' | 'kind' | 'view'> & {
  fileDirty: boolean;
};

interface TabsState {
  tabs: DocumentTab[];
  activeId: string;
  open: (input: OpenTabInput) => void;
  addUnloaded: (input: UnloadedTabInput) => void;
  remove: (id: string) => void;
  activate: (id: string) => void;
  activateIndex: (index: number) => void;
  updateView: (id: string, patch: Partial<ViewState>) => void;
  /** Runs a domain command on the tab's document; throws `RnjbError` when it is invalid. */
  apply: (id: string, command: Command) => void;
  undo: (id: string) => boolean;
  redo: (id: string) => boolean;
  patchTab: (id: string, patch: Partial<DocumentTab>) => void;
  findBySource: (source: TabSource) => DocumentTab | undefined;
}

let clock = 0;
const tick = () => ++clock;

export const useTabs = create<TabsState>((set, get) => {
  const update = (id: string, fn: (tab: DocumentTab) => DocumentTab) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? fn(tab) : tab)) }));

  const changed = (
    tab: DocumentTab,
    document: RnjbDocument,
    history: History,
    patches: Patch[],
  ) => {
    const revision = tab.revision + 1;
    void documentHost.patch(tab.id, patches, revision);
    return { ...tab, document, history, revision, title: document.meta.name };
  };

  return {
    tabs: [],
    activeId: HOME_TAB,

    open: (input) => {
      const tab: DocumentTab = {
        id: input.id,
        source: input.source,
        title: input.document.meta.name,
        kind: input.document.meta.kind,
        status: 'ready',
        document: input.document,
        history: emptyHistory(),
        mode: input.mode,
        issues: input.issues,
        view: initialView(input.document),
        revision: 0,
        draftRevision: 0,
        fileRevision: input.onDisk ? 0 : -1,
        fileStatus: 'idle',
        fileError: undefined,
        lastActive: tick(),
      };
      set((state) => ({ tabs: [...state.tabs, tab], activeId: tab.id }));
    },

    addUnloaded: (input) => {
      const tab: DocumentTab = {
        id: input.id,
        source: input.source,
        title: input.title,
        kind: input.kind,
        status: 'unloaded',
        document: undefined,
        history: emptyHistory(),
        mode: 'edit',
        issues: [],
        view: input.view,
        // A dirty draft starts one revision ahead of the file.
        revision: input.fileDirty ? 1 : 0,
        draftRevision: input.fileDirty ? 1 : 0,
        fileRevision: input.source.type === 'memory' ? -1 : 0,
        fileStatus: 'idle',
        fileError: undefined,
        lastActive: 0,
      };
      set((state) => ({ tabs: [...state.tabs, tab] }));
    },

    remove: (id) =>
      set((state) => {
        const index = state.tabs.findIndex((tab) => tab.id === id);
        const tabs = state.tabs.filter((tab) => tab.id !== id);
        if (state.activeId !== id) return { tabs };
        const neighbour = tabs[Math.min(index, tabs.length - 1)];
        return { tabs, activeId: neighbour?.id ?? HOME_TAB };
      }),

    activate: (id) => {
      if (id !== HOME_TAB) update(id, (tab) => ({ ...tab, lastActive: tick() }));
      set({ activeId: id });
    },

    activateIndex: (index) => {
      if (index === 0) return get().activate(HOME_TAB);
      const tab = get().tabs[index - 1];
      if (tab) get().activate(tab.id);
    },

    updateView: (id, patch) => update(id, (tab) => ({ ...tab, view: { ...tab.view, ...patch } })),

    apply: (id, command) => {
      const tab = get().tabs.find((candidate) => candidate.id === id);
      if (!tab || !canEdit(tab) || !tab.document) return;
      const result = applyCommand(tab.document, command, commandContext);
      if (result.patches.length === 0) return;
      const next = changed(tab, result.document, recordStep(tab.history, result), result.patches);
      // A command may update the view while it runs (e.g. select the node it created).
      update(id, (current) => ({ ...next, view: current.view }));
    },

    undo: (id) => {
      const tab = get().tabs.find((candidate) => candidate.id === id);
      if (!tab || !canEdit(tab) || !tab.document) return false;
      const result = undoStep(tab.document, tab.history);
      if (!result) return false;
      const next = changed(tab, result.document, result.history, result.applied);
      update(id, () => next);
      return true;
    },

    redo: (id) => {
      const tab = get().tabs.find((candidate) => candidate.id === id);
      if (!tab || !canEdit(tab) || !tab.document) return false;
      const result = redoStep(tab.document, tab.history);
      if (!result) return false;
      const next = changed(tab, result.document, result.history, result.applied);
      update(id, () => next);
      return true;
    },

    patchTab: (id, patch) => update(id, (tab) => ({ ...tab, ...patch })),

    findBySource: (source) => {
      const key = sourceKey(source);
      return key ? get().tabs.find((tab) => sourceKey(tab.source) === key) : undefined;
    },
  };
});

export const selectActiveTab = (state: TabsState): DocumentTab | undefined =>
  state.tabs.find((tab) => tab.id === state.activeId);
