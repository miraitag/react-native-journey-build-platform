import type { Device, DevicesPack } from '@rnjb/pack-schema';

export type ChromeStyle = DevicesPack['chromeStyles'][number];

/** Numeric, dot-separated comparison ("26" < "26.1" < "27"); non-numeric parts count as 0. */
export function compareOsVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Chrome style for a device at an OS version (§12): same platform, inside the style's version
 * range. When several match, the one with the highest minimum version is the most specific.
 */
export function pickChromeStyle(
  styles: readonly ChromeStyle[],
  device: Pick<Device, 'platform'>,
  osVersion: string,
): ChromeStyle | undefined {
  return styles
    .filter(
      (style) =>
        style.platform === device.platform &&
        compareOsVersions(osVersion, style.minOsVersion) >= 0 &&
        (style.maxOsVersion === undefined || compareOsVersions(osVersion, style.maxOsVersion) <= 0),
    )
    .sort((a, b) => compareOsVersions(b.minOsVersion, a.minOsVersion))[0];
}

export type Orientation = 'portrait' | 'landscape';

/** What the preview draws for a device: size and safe area after orientation and posture (§12). */
export interface DeviceView {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number };
  /** The fold of a foldable posture; zero wide on a flexible screen. */
  hinge: Box | undefined;
  /** Half opened: the app sees two segments, so content across the fold is split. */
  separating: boolean;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nodes of `ids` whose box crosses the fold; a zero-wide fold counts only when strictly inside. */
export function crossingFold(
  rects: Readonly<Record<string, Box>>,
  ids: readonly string[],
  fold: Box,
): string[] {
  return ids.filter((id) => {
    const box = rects[id];
    return (
      box !== undefined &&
      box.x < fold.x + fold.width &&
      box.x + box.width > fold.x &&
      box.y < fold.y + fold.height &&
      box.y + box.height > fold.y
    );
  });
}

/**
 * A posture replaces the logical size (and may add a hinge); landscape swaps the sides and uses
 * the landscape safe area. Unknown posture ids fall back to the device itself.
 */
export function deviceView(
  device: Device,
  orientation: Orientation,
  postureId: string | undefined,
): DeviceView {
  const posture = device.postures?.find((candidate) => candidate.id === postureId);
  const base = posture?.logicalSize ?? device.logicalSize;
  const landscape = orientation === 'landscape';
  const width = landscape ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
  const height = landscape ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
  const hinge = posture?.hinge;
  return {
    width,
    height,
    insets: landscape ? device.safeArea.landscape : device.safeArea.portrait,
    hinge:
      hinge && landscape !== base.width > base.height
        ? { x: hinge.y, y: hinge.x, width: hinge.height, height: hinge.width }
        : hinge,
    separating: (posture?.segments.length ?? 0) > 1,
  };
}

/**
 * Cutouts (notch, island, punch hole) where the view shows them: as declared in portrait, turned
 * to the left edge in landscape. A posture is another screen, so it shows none of the device's.
 */
export function cutoutsOf(
  device: Device,
  view: DeviceView,
): {
  kind: Device['cutouts'][number]['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
}[] {
  const { width, height } = device.logicalSize;
  const base =
    Math.min(width, height) === Math.min(view.width, view.height) &&
    Math.max(width, height) === Math.max(view.width, view.height);
  if (!base) return [];
  const portrait = view.height >= view.width;
  return device.cutouts.map(({ kind, rect }) =>
    portrait
      ? { kind, ...rect }
      : { kind, x: rect.y, y: width - rect.x - rect.width, width: rect.height, height: rect.width },
  );
}
