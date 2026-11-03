import { promises as fs } from 'node:fs';
import path from 'node:path';
import { devicesPackSchema, type DevicesPack } from '@rnjb/pack-schema';
import { builtInDevicesPack } from '@rnjb/profiles';
import type { Workspace } from './workspace.ts';

/**
 * Devices packs of the workspace (§12). Specs come from the team's curated files and are never
 * estimated here; files that do not validate are reported, not hidden.
 */
export async function listDevicesPacks(
  workspace: Workspace,
): Promise<{ packs: DevicesPack[]; invalid: { path: string }[] }> {
  const directory = path.join(workspace.root, 'packs/devices');
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const packs: DevicesPack[] = [builtInDevicesPack];
  const invalid: { path: string }[] = [];
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const relative = `packs/devices/${name}`;
    try {
      const parsed = devicesPackSchema.safeParse(JSON.parse(await workspace.read(relative)));
      if (parsed.success) packs.push(parsed.data);
      else invalid.push({ path: relative });
    } catch {
      invalid.push({ path: relative });
    }
  }
  return { packs, invalid };
}
