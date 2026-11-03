import { create } from 'zustand';
import type { WorkspaceEntry } from '@rnjb/core';
import { localService, type RemoteSyncResult } from './local-service.ts';

/** Stable fallback so selectors never return a fresh array (zustand compares by reference). */
export const NO_RESULTS: readonly RemoteSyncResult[] = [];

interface RemoteState {
  results: readonly RemoteSyncResult[];
  syncing: boolean;
  /** Synchronizes one source or all of them; failures of a single source live in its result. */
  sync: (id?: string) => Promise<readonly RemoteSyncResult[]>;
}

export const useRemotes = create<RemoteState>((set, get) => ({
  results: NO_RESULTS,
  syncing: false,
  sync: async (id) => {
    set({ syncing: true });
    try {
      const fresh = await localService.syncRemotes(id);
      const kept = id ? get().results.filter((result) => result.id !== id) : [];
      set({ results: [...kept, ...fresh] });
      return fresh;
    } finally {
      set({ syncing: false });
    }
  },
}));

/** The remote item a local copy came from, if its source has been synchronized. */
export function originOf(
  results: readonly RemoteSyncResult[],
  copy: WorkspaceEntry,
): WorkspaceEntry | undefined {
  const target = copy.remote;
  if (!target) return undefined;
  for (const result of results) {
    const found = result.entries.find(
      (entry) => entry.remote?.remote === target.remote && entry.remote.path === target.path,
    );
    if (found) return found;
  }
  return undefined;
}

/** The id of the remote source a local copy came from, if that source has been synchronized. */
export function sourceIdOf(
  results: readonly RemoteSyncResult[],
  copy: WorkspaceEntry,
): string | undefined {
  const target = copy.remote;
  if (!target) return undefined;
  return results.find((result) =>
    result.entries.some(
      (entry) => entry.remote?.remote === target.remote && entry.remote.path === target.path,
    ),
  )?.id;
}

export const hasUpdate = (results: readonly RemoteSyncResult[], copy: WorkspaceEntry): boolean => {
  const origin = originOf(results, copy);
  return Boolean(origin?.remote && copy.remote && origin.remote.commit !== copy.remote.commit);
};
