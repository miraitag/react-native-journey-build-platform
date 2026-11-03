import { describe, expect, it } from 'vitest';
import { createShims } from './shim-modules.ts';

const React = {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => ({
    type,
    props,
    children,
  }),
  createContext: <T>(value: T) => ({ Provider: 'Provider', Consumer: 'Consumer', value }),
  useContext: () => undefined,
  useRef: <T>(value: T) => ({ current: value }),
  useCallback: <T>(callback: T) => callback,
};
const RN = {
  View: 'View',
  ScrollView: 'ScrollView',
  Text: 'Text',
  Image: 'Image',
  FlatList: 'FlatList',
  TouchableOpacity: 'TouchableOpacity',
};

const shims = createShims(React, RN) as Record<string, Record<string, unknown>>;
const call = (module: string, name: string, ...args: unknown[]) =>
  (shims[module]?.[name] as (...rest: unknown[]) => unknown)(...args);

describe('native module shims (§7.4)', () => {
  it('registers every module the initial libraries need as an ES module', () => {
    for (const name of [
      'react-native-gesture-handler',
      'react-native-reanimated',
      'react-native-worklets',
      'react-native-screens',
      'react-native-safe-area-context',
      'react-native-svg',
      'react-native-share',
      'react-native-view-shot',
      '@react-native-clipboard/clipboard',
      '@react-native-community/netinfo',
    ]) {
      expect(shims[name]?.['__esModule'], name).toBe(true);
      expect(shims[name]?.['default'], name).toBeDefined();
    }
  });

  it('draws react-native-svg through DOM svg elements, default and named', () => {
    const svg = shims['react-native-svg'] as Record<string, (props: object) => unknown>;
    expect(svg['default']).toBe(svg['Svg']);
    expect(svg['Path']?.({ d: 'M0 0' })).toMatchObject({ type: 'path', props: { d: 'M0 0' } });
    expect(svg['LinearGradient']?.({})).toMatchObject({ type: 'linearGradient' });
  });

  it('safe-area-context reports zero insets: the preview iframe already sits inside them', () => {
    expect(call('react-native-safe-area-context', 'useSafeAreaInsets')).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(call('react-native-safe-area-context', 'SafeAreaView', { style: 1 })).toMatchObject({
      type: 'View',
    });
  });

  it('reanimated keeps hooks callable and animations resolve to their target value', () => {
    expect(call('react-native-reanimated', 'withTiming', 5)).toBe(5);
    expect(call('react-native-reanimated', 'withSequence', 1, 2, 3)).toBe(3);
    expect(call('react-native-reanimated', 'useSharedValue', 0)).toEqual({ value: 0 });
    expect(call('react-native-reanimated', 'useAnimatedStyle', () => ({ opacity: 1 }))).toEqual({
      opacity: 1,
    });
    expect(call('react-native-reanimated', 'interpolate', 5, [0, 10], [0, 100])).toBe(50);
    const fade = shims['react-native-reanimated']?.['FadeIn'] as {
      duration: (ms: number) => { delay: (ms: number) => unknown };
    };
    expect(() => fade.duration(200).delay(50)).not.toThrow();
    const callback: unknown[] = [];
    call('react-native-reanimated', 'withTiming', 1, {}, (finished: unknown) =>
      callback.push(finished),
    );
    expect(callback).toEqual([true]);
  });

  it('gesture-handler builders chain and detectors pass their children through', () => {
    const gesture = shims['react-native-gesture-handler']?.['Gesture'] as {
      Pan: () => { onUpdate: (fn: () => void) => { onEnd: (fn: () => void) => unknown } };
    };
    expect(() =>
      gesture
        .Pan()
        .onUpdate(() => undefined)
        .onEnd(() => undefined),
    ).not.toThrow();
    expect(call('react-native-gesture-handler', 'GestureDetector', { children: 'x' })).toBe('x');
  });

  it('native-only modules resolve to harmless defaults', async () => {
    await expect(call('@react-native-community/netinfo', 'fetch')).resolves.toMatchObject({
      isConnected: true,
    });
    await expect(call('@react-native-clipboard/clipboard', 'getString')).resolves.toBe('');
    expect(call('react-native-screens', 'screensEnabled')).toBe(false);
    expect(call('react-native-worklets', 'scheduleOnRN', (a: number) => a + 1, 1)).toBe(2);
  });
});
