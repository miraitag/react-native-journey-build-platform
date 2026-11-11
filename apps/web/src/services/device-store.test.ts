import { describe, expect, it } from 'vitest';
import type { Device } from '@rnjb/pack-schema';
import { defaultComparison } from './device-store.ts';

const device = (id: string, platform: 'ios' | 'android', width: number) =>
  ({ id, platform, logicalSize: { width, height: 800 } }) as Device;

describe('defaultComparison', () => {
  it('picks the other platform and the narrowest device of the same one', () => {
    const main = device('pixel', 'android', 412);
    const devices = [
      main,
      device('wide', 'android', 448),
      device('small', 'android', 360),
      device('iphone', 'ios', 393),
    ];
    expect(defaultComparison(main, devices)).toEqual(['iphone', 'small']);
    expect(defaultComparison(main, [main])).toEqual([]);
  });
});
