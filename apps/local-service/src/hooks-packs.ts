import { promises as fs } from 'node:fs';
import path from 'node:path';
import { hooksPackSchema, type HooksPack } from '@rnjb/pack-schema';
import type { Workspace } from './workspace.ts';

/**
 * Hooks packs of the workspace (§7.5): which hooks exist and in which layers they may be used.
 * Files that do not validate are reported, not hidden.
 */
export async function listHooksPacks(
  workspace: Workspace,
): Promise<{ packs: HooksPack[]; invalid: { path: string }[] }> {
  const directory = path.join(workspace.root, 'packs/hooks');
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const packs: HooksPack[] = [];
  const invalid: { path: string }[] = [];
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const relative = `packs/hooks/${name}`;
    try {
      const parsed = hooksPackSchema.safeParse(JSON.parse(await workspace.read(relative)));
      if (parsed.success) packs.push(parsed.data);
      else invalid.push({ path: relative });
    } catch {
      invalid.push({ path: relative });
    }
  }
  return { packs, invalid };
}
