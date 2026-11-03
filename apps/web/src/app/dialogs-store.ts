import { create } from 'zustand';
import type { DocumentKind, RnjbDocument, WorkspaceEntry } from '@rnjb/core';

type DialogName =
  | 'settings'
  | 'create'
  | 'palette'
  | 'shortcuts'
  | 'trash'
  | 'compare'
  | 'export'
  | 'import'
  | 'team'
  | 'devices';

/** «Crear desde plantilla» and «Guardar como plantilla»: copies the file at `path` as `target`. */
export interface DeriveRequest {
  path: string;
  name: string;
  target: DocumentKind;
}

interface DialogState {
  open: DialogName | undefined;
  derive: DeriveRequest | undefined;
  /** «Comparar» a copy of a remote item with its origin (§6.4). */
  compare: WorkspaceEntry | undefined;
  /** The journey being exported (§16). */
  exportDocument: RnjbDocument | undefined;
  show: (name: DialogName) => void;
  showDerive: (request: DeriveRequest) => void;
  showCompare: (copy: WorkspaceEntry) => void;
  showExport: (document: RnjbDocument) => void;
  hide: () => void;
}

/** One modal at a time; opening another replaces the current one. */
export const useDialogs = create<DialogState>((set) => ({
  open: undefined,
  derive: undefined,
  compare: undefined,
  exportDocument: undefined,
  show: (name) =>
    set({ open: name, derive: undefined, compare: undefined, exportDocument: undefined }),
  showDerive: (request) =>
    set({ open: 'create', derive: request, compare: undefined, exportDocument: undefined }),
  showCompare: (copy) =>
    set({ open: 'compare', derive: undefined, compare: copy, exportDocument: undefined }),
  showExport: (document) =>
    set({ open: 'export', derive: undefined, compare: undefined, exportDocument: document }),
  hide: () =>
    set({ open: undefined, derive: undefined, compare: undefined, exportDocument: undefined }),
}));

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl';
export const ALT = IS_MAC ? '⌥' : 'Alt';
