import { create } from 'zustand';
import type { WorkspaceEntry } from '@rnjb/core';
import type { LocalSettings } from '@rnjb/pack-schema';
import { ServiceError, localService, type WorkspaceIndex } from './local-service.ts';
import { NO_RESULTS, useRemotes } from './remote-store.ts';

export type ServiceStatus = 'checking' | 'online' | 'offline';

/** Looks for updates in every remote source; a failure is shown per source, never thrown. */
const syncRemotesQuietly = (settings: LocalSettings): void => {
  if (settings.remoteSources.length === 0) {
    useRemotes.setState({ results: NO_RESULTS });
    return;
  }
  void useRemotes
    .getState()
    .sync()
    .catch(() => undefined);
};

/** Stable fallback so selectors never return a fresh array (zustand compares by reference). */
export const NO_ENTRIES: readonly WorkspaceEntry[] = [];
export const selectEntries = (state: { index: WorkspaceIndex | undefined }) =>
  state.index?.entries ?? NO_ENTRIES;

interface ServiceState {
  status: ServiceStatus;
  settings: LocalSettings | undefined;
  index: WorkspaceIndex | undefined;
  indexing: boolean;
  connect: () => Promise<void>;
  refreshIndex: () => Promise<void>;
  saveSettings: (settings: LocalSettings) => Promise<LocalSettings>;
}

export const useService = create<ServiceState>((set, get) => ({
  status: 'checking',
  settings: undefined,
  index: undefined,
  indexing: false,

  connect: async () => {
    if (get().status !== 'online') set({ status: 'checking' });
    try {
      await localService.health();
      const settings = await localService.settings();
      set({ status: 'online', settings });
      await get().refreshIndex();
      syncRemotesQuietly(settings);
    } catch (error) {
      if (error instanceof ServiceError && error.code === 'RNJB-401')
        set({ status: 'offline', index: undefined });
      else throw error;
    }
  },

  refreshIndex: async () => {
    if (!get().settings?.workspacePath) {
      set({ index: undefined });
      return;
    }
    set({ indexing: true });
    try {
      set({ index: await localService.index() });
    } finally {
      set({ indexing: false });
    }
  },

  saveSettings: async (settings) => {
    const saved = await localService.saveSettings(settings);
    set({ settings: saved });
    await get().refreshIndex();
    syncRemotesQuietly(saved);
    return saved;
  },
}));
