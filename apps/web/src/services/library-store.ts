import { create } from 'zustand';
import type { LibraryPack } from '@rnjb/pack-schema';
import { localService } from './local-service.ts';
import type { LibraryDiff } from './local-service.ts';

export const NO_PACKS: readonly LibraryPack[] = [];

interface LibraryState {
  packs: readonly LibraryPack[];
  loading: boolean;
  extracting: string | undefined;
  load: () => Promise<void>;
  extract: (pkg: string) => Promise<LibraryDiff>;
}

export const useLibraries = create<LibraryState>((set) => ({
  packs: NO_PACKS,
  loading: false,
  extracting: undefined,

  load: async () => {
    set({ loading: true });
    try {
      const { packs } = await localService.listLibraryPacks();
      set({ packs });
    } finally {
      set({ loading: false });
    }
  },

  extract: async (pkg) => {
    set({ extracting: pkg });
    try {
      const { pack, diff } = await localService.extractLibrary(pkg);
      set((state) => ({
        packs: [...state.packs.filter((candidate) => candidate.id !== pack.id), pack].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      }));
      return diff;
    } finally {
      set({ extracting: undefined });
    }
  },
}));
