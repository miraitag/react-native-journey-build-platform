import { devicesPackSchema, type DevicesPack } from '@rnjb/pack-schema';
import { builtInDevicesPack } from '@rnjb/profiles';
import { listPacksIn } from './hooks-packs.ts';
import type { Workspace } from './workspace.ts';

/**
 * Devices packs of the workspace (§12), after the built-in one. Specs come from the team's
 * curated files and are never estimated here.
 */
export async function listDevicesPacks(
  workspace: Workspace,
): Promise<{ packs: DevicesPack[]; invalid: { path: string }[] }> {
  const { packs, invalid } = await listPacksIn(workspace, 'devices', devicesPackSchema);
  return { packs: [builtInDevicesPack, ...packs], invalid };
}
