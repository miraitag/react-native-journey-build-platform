import { create } from 'zustand';
import type { BlocksPack } from '@rnjb/pack-schema';
import { localService } from './local-service.ts';

export type Block = BlocksPack['blocks'][number];

/** A block with the pack it comes from; ids are unique only inside a pack. */
export interface ListedBlock {
  key: string;
  block: Block;
}

export const NO_BLOCKS: readonly ListedBlock[] = [];

/** Blocks saved from the editor go to one pack of the workspace, next to the team's packs (§7.5). */
const OWN_PACK_ID = 'workspace-blocks';
const OWN_PACK_PATH = 'packs/blocks/workspace.json';

interface BlocksState {
  blocks: readonly ListedBlock[];
  own: BlocksPack | undefined;
  load: () => Promise<void>;
  save: (block: Block) => Promise<void>;
}

export const useBlocks = create<BlocksState>((set, get) => ({
  blocks: NO_BLOCKS,
  own: undefined,

  load: async () => {
    const { packs } = await localService.listBlocksPacks();
    set({
      blocks: packs.flatMap((pack) =>
        pack.blocks.map((block) => ({ key: `${pack.id}/${block.id}`, block })),
      ),
      own: packs.find((pack) => pack.id === OWN_PACK_ID),
    });
  },

  save: async (block) => {
    const own: BlocksPack = get().own ?? {
      schemaVersion: 1,
      id: OWN_PACK_ID,
      name: 'Bloques',
      version: '1.0.0',
      kind: 'blocks',
      blocks: [],
    };
    const pack: BlocksPack = { ...own, blocks: [...own.blocks, block] };
    await localService.writeFile(OWN_PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`);
    await get().load();
  },
}));
