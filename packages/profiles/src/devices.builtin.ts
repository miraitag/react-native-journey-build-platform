import { devicesPackSchema, type Device, type DevicesPack } from '@rnjb/pack-schema';

/**
 * Built-in device list. Sizes are logical (dp / pt). `specSource` / `reviewedAt` cover the logical
 * size and density only:
 * - iPhone: the pixel resolution on Apple's Tech Specs page, divided by the @3x scale (it matches
 *   the viewports DeviceAtlas measures).
 * - Android: the viewport and panel resolution DeviceAtlas measured in May 2026 (manufacturers do
 *   not publish dp sizes); density = panel width / viewport width.
 * Safe areas, cutouts and corner radii are published by no manufacturer: they stay approximate.
 * A device without `specSource` was not checked. A workspace pack with the same id replaces any.
 */
type Spec = [id: string, name: string, width: number, height: number, density: number];

const box = (top: number, right: number, bottom: number, left: number) => ({
  top,
  right,
  bottom,
  left,
});

const ios = (
  [id, name, width, height, density]: Spec,
  island: boolean,
  top: number,
  radius: number,
): Device => {
  const cut = island ? { w: 125, h: 37, y: 11 } : { w: 162, h: 30, y: 0 };
  return {
    id,
    name,
    platform: 'ios',
    osVersions: ['18', '26'],
    defaultOsVersion: '26',
    logicalSize: { width, height },
    density,
    cornerRadius: radius,
    cutouts: [
      {
        kind: island ? 'dynamic-island' : 'notch',
        rect: { x: (width - cut.w) / 2, y: cut.y, width: cut.w, height: cut.h },
      },
    ],
    safeArea: {
      portrait: box(top, 0, 34, 0),
      landscape: box(0, island ? 62 : 47, 21, island ? 62 : 47),
    },
    statusBarHeight: top,
    bottomChrome: 'home-indicator',
  };
};

const android = (
  [id, name, width, height, density]: Spec,
  osVersion: string,
  statusBar = 32,
): Device => ({
  id,
  name,
  platform: 'android',
  osVersions: [osVersion],
  defaultOsVersion: osVersion,
  logicalSize: { width, height },
  density,
  cornerRadius: 24,
  cutouts: [{ kind: 'punch-hole', rect: { x: (width - 24) / 2, y: 8, width: 24, height: 24 } }],
  safeArea: { portrait: box(statusBar, 0, 24, 0), landscape: box(0, 32, 24, 32) },
  statusBarHeight: statusBar,
  bottomChrome: 'gesture-bar',
});

const REVIEWED_AT = '2026-11-02';
const APPLE_SPECS = 'https://support.apple.com/en-us/';
const DEVICEATLAS =
  'https://deviceatlas.com/blog/viewport-resolution-diagonal-screen-size-and-dpi-most-popular-smartphones';
const sourced = (device: Device, specSource: string): Device => ({
  ...device,
  specSource,
  reviewedAt: REVIEWED_AT,
});

const rect = (width: number, height: number) => ({ x: 0, y: 0, width, height });

const posture = (id: string, name: string, width: number, height: number) => ({
  id,
  name,
  logicalSize: { width, height },
  segments: [rect(width, height)],
});

// The inner screen is flexible: the fold hides nothing (zero width), as Jetpack WindowManager reports
// it. Half opened it separates two segments an app can lay out apart (book or tabletop).
const FOLD = { x: 432, y: 0, width: 0, height: 722 };
const pixelFold: Device = {
  ...android(['pixel-fold', 'Pixel Fold', 424, 820, 2.55], '16'),
  postures: [
    { ...posture('unfolded', 'Desplegado', 864, 722), hinge: FOLD },
    {
      ...posture('half-opened', 'Medio abierto', 864, 722),
      segments: [rect(432, 722), { ...rect(432, 722), x: 432 }],
      hinge: FOLD,
    },
  ],
};

const resizable: Device = {
  ...android(['resizable', 'Resizable (Experimental)', 411, 914, 2.625], '16'),
  postures: [
    posture('foldable', 'Foldable', 673, 841),
    posture('tablet', 'Tablet', 1280, 800),
    posture('desktop', 'Desktop', 1920, 1080),
  ],
};

const pixelTablet: Device = {
  ...android(['pixel-tablet', 'Pixel Tablet', 927, 1484, 1.725], '16', 24),
  cutouts: [],
  cornerRadius: 0,
};

const A = '15';

export const builtInDevicesPack: DevicesPack = devicesPackSchema.parse({
  schemaVersion: 1,
  id: 'builtin-devices',
  name: 'Dispositivos',
  version: '0.1.0',
  description:
    'Tamaño lógico y densidad con fuente (Apple Tech Specs; DeviceAtlas, mayo 2026) donde hay specSource; áreas seguras, recortes y radios son aproximados.',
  kind: 'devices',
  devices: [
    android(['medium-phone', 'Medium Phone', 411, 914, 2.625], '16'),
    android(['pixel-10', 'Pixel 10', 412, 923, 2.625], '16'),
    sourced(android(['pixel-8', 'Pixel 8', 412, 915, 2.625], '16'), DEVICEATLAS),
    android(['small-phone', 'Small Phone', 360, 640, 2], '16', 24),
    sourced(android(['pixel-9-pro-xl', 'Pixel 9 Pro XL', 448, 998, 3], '16'), DEVICEATLAS),
    android(['pixel-7a', 'Pixel 7a', 412, 915, 2.625], '16'),
    pixelFold,
    pixelTablet,
    resizable,
    android(['galaxy-a16-custom', 'Samsung Galaxy A16 (personalizado)', 411, 891, 2.625], A),
    sourced(
      android(['galaxy-a12', 'Samsung Galaxy A12', 385, 854, 720 / 385], '13', 24),
      DEVICEATLAS,
    ),
    android(['galaxy-a13', 'Samsung Galaxy A13', 412, 915, 2.625], '14'),
    android(['galaxy-a16', 'Samsung Galaxy A16', 411, 891, 2.625], A),
    android(['galaxy-a15', 'Samsung Galaxy A15', 411, 891, 2.625], A),
    android(['redmi-a5', 'Redmi A5', 360, 820, 2], A, 24),
    sourced(
      android(['galaxy-s24-ultra', 'Samsung Galaxy S24 Ultra', 384, 832, 3.75], A),
      DEVICEATLAS,
    ),
    android(['galaxy-a06', 'Samsung Galaxy A06', 360, 800, 2], A, 24),
    sourced(
      android(['galaxy-s25-ultra', 'Samsung Galaxy S25 Ultra', 384, 832, 3.75], A),
      DEVICEATLAS,
    ),
    android(['galaxy-a55', 'Samsung Galaxy A55 5G', 411, 891, 2.625], A),
    sourced(android(['galaxy-a54', 'Samsung Galaxy A54 5G', 384, 832, 2.8125], A), DEVICEATLAS),
    sourced(
      ios(['iphone-17-pro', 'iPhone 17 Pro', 402, 874, 3], true, 62, 62),
      `${APPLE_SPECS}125090`,
    ),
    sourced(ios(['iphone-13', 'iPhone 13', 390, 844, 3], false, 47, 47), `${APPLE_SPECS}111872`),
    sourced(ios(['iphone-15', 'iPhone 15', 393, 852, 3], true, 59, 55), `${APPLE_SPECS}111831`),
    sourced(
      ios(['iphone-16-pro', 'iPhone 16 Pro', 402, 874, 3], true, 62, 62),
      `${APPLE_SPECS}121031`,
    ),
    sourced(ios(['iphone-17', 'iPhone 17', 402, 874, 3], true, 62, 62), `${APPLE_SPECS}125089`),
    sourced(
      ios(['iphone-17-pro-max', 'iPhone 17 Pro Max', 440, 956, 3], true, 62, 62),
      `${APPLE_SPECS}125091`,
    ),
    sourced(ios(['iphone-16', 'iPhone 16', 393, 852, 3], true, 59, 55), `${APPLE_SPECS}121029`),
    sourced(
      ios(['iphone-15-pro', 'iPhone 15 Pro', 393, 852, 3], true, 59, 55),
      `${APPLE_SPECS}111829`,
    ),
    sourced(ios(['iphone-14', 'iPhone 14', 390, 844, 3], false, 47, 47), `${APPLE_SPECS}111850`),
    sourced(ios(['iphone-12', 'iPhone 12', 390, 844, 3], false, 47, 47), `${APPLE_SPECS}111876`),
  ],
  // Visual approximations (the preview shows the "vista aproximada" badge), keyed by OS version.
  chromeStyles: [
    {
      id: 'ios-classic',
      platform: 'ios',
      minOsVersion: '15',
      maxOsVersion: '25.9',
      family: 'ios-classic',
      tokens: { statusBarBackground: 'rgba(249, 249, 249, 0.94)', indicatorColor: '#000000' },
    },
    {
      id: 'ios-liquid-glass',
      platform: 'ios',
      minOsVersion: '26',
      family: 'liquid-glass',
      tokens: {
        statusBarBackground: 'rgba(255, 255, 255, 0.16)',
        backdropFilter: 'blur(12px) saturate(180%)',
        indicatorColor: 'rgba(0, 0, 0, 0.8)',
      },
    },
    {
      id: 'android-material-3',
      platform: 'android',
      minOsVersion: '12',
      maxOsVersion: '15.9',
      family: 'material-3',
      tokens: { statusBarBackground: 'rgba(254, 247, 255, 0.96)', indicatorColor: '#1d1b20' },
    },
    {
      id: 'android-material-3-expressive',
      platform: 'android',
      minOsVersion: '16',
      family: 'material-3-expressive',
      tokens: {
        statusBarBackground: 'rgba(254, 247, 255, 0.72)',
        backdropFilter: 'blur(8px)',
        indicatorColor: '#1d1b20',
      },
    },
  ],
});
