import { describe, expect, it } from 'vitest';
import type { Device } from '@rnjb/pack-schema';
import {
  compareOsVersions,
  crossingFold,
  cutoutsOf,
  deviceView,
  pickChromeStyle,
} from './chrome-style.ts';

const style = (id: string, platform: 'ios' | 'android', min: string, max?: string) => ({
  id,
  platform,
  minOsVersion: min,
  ...(max ? { maxOsVersion: max } : {}),
  family: id,
  tokens: {},
});

describe('chrome styles by OS version (§12)', () => {
  it('compares versions numerically', () => {
    expect(compareOsVersions('26', '18.4')).toBeGreaterThan(0);
    expect(compareOsVersions('9', '10')).toBeLessThan(0);
    expect(compareOsVersions('26.0', '26')).toBe(0);
  });

  it('picks the style of the platform whose range contains the version', () => {
    const styles = [
      style('ios-classic', 'ios', '15', '25.9'),
      style('ios-glass', 'ios', '26'),
      style('android-m3', 'android', '12'),
    ];
    expect(pickChromeStyle(styles, { platform: 'ios' }, '18')?.id).toBe('ios-classic');
    expect(pickChromeStyle(styles, { platform: 'ios' }, '26.1')?.id).toBe('ios-glass');
    expect(pickChromeStyle(styles, { platform: 'android' }, '14')?.id).toBe('android-m3');
  });

  it('prefers the most specific style and returns nothing when none applies', () => {
    const styles = [style('base', 'ios', '15'), style('glass', 'ios', '26')];
    expect(pickChromeStyle(styles, { platform: 'ios' }, '27')?.id).toBe('glass');
    expect(pickChromeStyle(styles, { platform: 'ios' }, '14')).toBeUndefined();
    expect(pickChromeStyle(styles, { platform: 'android' }, '14')).toBeUndefined();
  });
});

describe('deviceView (§12)', () => {
  const box = { top: 0, right: 0, bottom: 0, left: 0 };
  const device: Device = {
    id: 'fold',
    name: 'Fold',
    platform: 'android',
    osVersions: ['16'],
    defaultOsVersion: '16',
    logicalSize: { width: 400, height: 900 },
    density: 2,
    cornerRadius: 20,
    cutouts: [],
    safeArea: { portrait: { ...box, top: 30 }, landscape: { ...box, left: 30 } },
    statusBarHeight: 30,
    bottomChrome: 'gesture-bar',
    postures: [
      {
        id: 'open',
        name: 'Open',
        logicalSize: { width: 800, height: 700 },
        segments: [
          { x: 0, y: 0, width: 396, height: 700 },
          { x: 404, y: 0, width: 396, height: 700 },
        ],
        hinge: { x: 396, y: 0, width: 8, height: 700 },
      },
    ],
  };

  it('swaps sides and safe area in landscape', () => {
    expect(deviceView(device, 'landscape', undefined)).toMatchObject({
      width: 900,
      height: 400,
      insets: { left: 30, top: 0 },
    });
  });

  it('uses the posture size and keeps its hinge, rotated with the screen', () => {
    expect(deviceView(device, 'landscape', 'open')).toMatchObject({
      width: 800,
      height: 700,
      hinge: { x: 396, width: 8 },
    });
    expect(deviceView(device, 'portrait', 'open')).toMatchObject({
      width: 700,
      height: 800,
      hinge: { y: 396, height: 8 },
    });
    expect(deviceView(device, 'portrait', 'missing').width).toBe(400);
  });

  it('is separating only when the posture has two segments', () => {
    expect(deviceView(device, 'landscape', 'open').separating).toBe(true);
    expect(deviceView(device, 'landscape', undefined).separating).toBe(false);
  });
});

describe('crossingFold (§12)', () => {
  const rects = {
    left: { x: 0, y: 0, width: 432, height: 40 },
    across: { x: 400, y: 0, width: 64, height: 40 },
    right: { x: 432, y: 0, width: 100, height: 40 },
  };

  it('finds what a zero-wide fold splits, not what only touches it', () => {
    const fold = { x: 432, y: 0, width: 0, height: 722 };
    expect(crossingFold(rects, ['left', 'across', 'right', 'gone'], fold)).toEqual(['across']);
  });

  it('counts touching a hinge band that hides pixels', () => {
    const band = { x: 428, y: 0, width: 8, height: 722 };
    expect(crossingFold(rects, ['left', 'across', 'right'], band)).toEqual([
      'left',
      'across',
      'right',
    ]);
  });
});

describe('cutoutsOf (§12)', () => {
  const box = { top: 0, right: 0, bottom: 0, left: 0 };
  const phone: Device = {
    id: 'p',
    name: 'Phone',
    platform: 'ios',
    osVersions: ['26'],
    defaultOsVersion: '26',
    logicalSize: { width: 400, height: 800 },
    density: 3,
    cornerRadius: 40,
    cutouts: [{ kind: 'dynamic-island', rect: { x: 140, y: 10, width: 120, height: 36 } }],
    safeArea: { portrait: box, landscape: box },
    statusBarHeight: 50,
    bottomChrome: 'home-indicator',
    postures: [
      { id: 'open', name: 'Open', logicalSize: { width: 700, height: 800 }, segments: [] },
    ],
  };

  it('keeps cutouts in portrait and turns them to the left edge in landscape', () => {
    expect(cutoutsOf(phone, deviceView(phone, 'portrait', undefined))).toEqual([
      { kind: 'dynamic-island', x: 140, y: 10, width: 120, height: 36 },
    ]);
    expect(cutoutsOf(phone, deviceView(phone, 'landscape', undefined))).toEqual([
      { kind: 'dynamic-island', x: 10, y: 140, width: 36, height: 120 },
    ]);
  });

  it('shows none on another posture', () => {
    expect(cutoutsOf(phone, deviceView(phone, 'portrait', 'open'))).toEqual([]);
  });
});
