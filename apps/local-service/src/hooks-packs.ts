import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { blocksPackSchema, hooksPackSchema } from '@rnjb/pack-schema';
import type { Workspace } from './workspace.ts';

/**
 * The packs in `packs/<folder>` of the workspace (§7.5), in file-name order. Files that do not
 * validate are reported, not hidden.
 */
export async function listPacksIn<T>(
  workspace: Workspace,
  folder: string,
  schema: z.ZodType<T>,
): Promise<{ packs: T[]; invalid: { path: string }[] }> {
  const names = await fs.readdir(path.join(workspace.root, 'packs', folder)).catch(() => []);
  const packs: T[] = [];
  const invalid: { path: string }[] = [];
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const relative = `packs/${folder}/${name}`;
    try {
      const parsed = schema.safeParse(JSON.parse(await workspace.read(relative)));
      if (parsed.success) packs.push(parsed.data);
      else invalid.push({ path: relative });
    } catch {
      invalid.push({ path: relative });
    }
  }
  return { packs, invalid };
}

/** Hooks packs: which hooks exist and in which layers they may be used. */
export const listHooksPacks = (workspace: Workspace) =>
  listPacksIn(workspace, 'hooks', hooksPackSchema);

/** Blocks packs: reusable node groups saved with «Guardar como bloque». */
export const listBlocksPacks = (workspace: Workspace) =>
  listPacksIn(workspace, 'blocks', blocksPackSchema);
