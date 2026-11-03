import { create } from 'zustand';
import type { HooksPack } from '@rnjb/pack-schema';
import { localService } from './local-service.ts';

export const NO_HOOK_PACKS: readonly HooksPack[] = [];

interface HooksState {
  packs: readonly HooksPack[];
  load: () => Promise<void>;
}

export const useHookPacks = create<HooksState>((set) => ({
  packs: NO_HOOK_PACKS,
  load: async () => {
    const { packs } = await localService.listHooksPacks();
    set({ packs });
  },
}));
