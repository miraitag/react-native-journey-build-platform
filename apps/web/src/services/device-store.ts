import { create } from 'zustand';
import type { Device, DevicesPack } from '@rnjb/pack-schema';
import type { Orientation } from '../editor/chrome-style.ts';
import { localService } from './local-service.ts';

export const NO_DEVICES: readonly Device[] = [];
export const NO_CHROME_STYLES: DevicesPack['chromeStyles'] = [];

/** Where the user's own devices live in the workspace; the file is a regular devices pack. */
export const CUSTOM_PACK_PATH = 'packs/devices/custom.json';
const CUSTOM_PACK_ID = 'custom-devices';

interface DeviceState {
  devices: readonly Device[];
  /** Devices the user created, a subset of `devices`. */
  custom: readonly Device[];
  chromeStyles: DevicesPack['chromeStyles'];
  selectedId: string | undefined;
  /** OS version picked per device; absent means the device's default. */
  osVersions: Readonly<Record<string, string>>;
  orientation: Orientation;
  /** Posture picked per foldable device; absent means the device's own (closed) size. */
  postures: Readonly<Record<string, string>>;
  /** Up to two more devices shown next to the selected screen (§12.6). */
  compareIds: readonly string[];
  load: () => Promise<void>;
  saveCustom: (devices: readonly Device[]) => Promise<void>;
  select: (id: string | undefined) => void;
  selectOsVersion: (deviceId: string, osVersion: string) => void;
  setOrientation: (orientation: Orientation) => void;
  selectPosture: (deviceId: string, postureId: string | undefined) => void;
  setCompare: (ids: readonly string[]) => void;
}

export const MAX_COMPARED = 2;

export const useDevices = create<DeviceState>((set, get) => ({
  devices: NO_DEVICES,
  custom: NO_DEVICES,
  chromeStyles: NO_CHROME_STYLES,
  selectedId: undefined,
  osVersions: {},
  orientation: 'portrait',
  postures: {},
  compareIds: [],

  load: async () => {
    const { packs } = await localService.listDevicesPacks();
    // A later pack wins when two use the same id, so a curated file can replace a built-in device.
    const byId = new Map<string, Device>();
    for (const pack of packs) for (const device of pack.devices) byId.set(device.id, device);
    const devices = [...byId.values()];
    const selected = get().selectedId;
    set({
      devices,
      custom: packs.find((pack) => pack.id === CUSTOM_PACK_ID)?.devices ?? NO_DEVICES,
      chromeStyles: packs.flatMap((pack) => pack.chromeStyles),
      selectedId: devices.some((device) => device.id === selected) ? selected : devices[0]?.id,
      compareIds: get().compareIds.filter((id) => devices.some((device) => device.id === id)),
    });
  },

  saveCustom: async (devices) => {
    const pack: DevicesPack = {
      schemaVersion: 1,
      id: CUSTOM_PACK_ID,
      name: 'Dispositivos personalizados',
      version: '1.0.0',
      kind: 'devices',
      devices: [...devices],
      chromeStyles: [],
    };
    await localService.writeFile(CUSTOM_PACK_PATH, `${JSON.stringify(pack, null, 2)}\n`);
    await get().load();
  },

  select: (id) => set({ selectedId: id }),

  selectOsVersion: (deviceId, osVersion) =>
    set((state) => ({ osVersions: { ...state.osVersions, [deviceId]: osVersion } })),

  setOrientation: (orientation) => set({ orientation }),

  selectPosture: (deviceId, postureId) =>
    set((state) => {
      const { [deviceId]: _previous, ...rest } = state.postures;
      return { postures: postureId ? { ...rest, [deviceId]: postureId } : rest };
    }),

  setCompare: (ids) => set({ compareIds: ids.slice(0, MAX_COMPARED) }),
}));

/** OS version in effect for a device: the user's pick if still valid, else its default. */
export const osVersionOf = (
  device: Device,
  osVersions: Readonly<Record<string, string>>,
): string => {
  const picked = osVersions[device.id];
  return picked && device.osVersions.includes(picked) ? picked : device.defaultOsVersion;
};
