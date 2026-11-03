import { describe, expect, it } from 'vitest';
import type { Screen } from '@rnjb/core';
import { frameMessageSchema, hostMessageSchema } from './protocol.ts';
import { buildScene, resolveProp, styleOf } from './scene.ts';
import { ShimRegistry } from './shims.ts';

const ref = { package: '@acme/ui', component: 'Button', version: '1.0.0' };

const screen: Screen = {
  id: 's1',
  name: 'Home',
  rootId: 'root',
  states: [],
  logic: { hooks: [], blocks: [] },
  nodes: {
    root: {
      id: 'root',
      kind: 'component',
      ref: { ...ref, component: 'Box' },
      props: {},
      children: ['a', 'code'],
      layout: { flexDirection: 'row', width: '50%', height: 'calc(100% - 1px)' },
      spacing: {
        padding: { top: { type: 'literal', value: 8 } },
        gap: { type: 'token', group: 'space', name: 'md' },
      },
    },
    a: {
      id: 'a',
      kind: 'component',
      name: 'Pay',
      ref,
      props: {
        label: { type: 'literal', value: 'Pagar' },
        amount: { type: 'binding', source: 'uiState', path: 'cart.total' },
        hidden: { type: 'expression', code: 'process.exit(1)' },
      },
      children: [],
      layout: {},
      spacing: {},
    },
    code: {
      id: 'code',
      kind: 'code',
      code: { language: 'tsx', source: 'alert(1)', imports: [] },
      children: [],
    },
    orphan: {
      id: 'orphan',
      kind: 'code',
      code: { language: 'ts', source: '', imports: [] },
      children: [],
    },
  },
};

describe('scene (ADR 0005)', () => {
  it('builds a flat scene with the reachable nodes only', () => {
    const scene = buildScene(screen, {
      sample: { cart: { total: 42 } },
      tokens: { 'space.md': 12 },
    });
    expect(Object.keys(scene.nodes).sort()).toEqual(['a', 'code', 'root']);
    expect(scene.nodes['a']?.label).toBe('Pay');
    expect(scene.nodes['a']?.props).toEqual({ label: 'Pagar', amount: 42, hidden: '{ƒ}' });
    expect(scene.nodes['root']?.style).toEqual({
      flexDirection: 'row',
      width: '50%',
      paddingTop: 8,
      gap: 12,
    });
  });

  it('never evaluates code, expressions or unsafe binding paths', () => {
    const scene = buildScene(screen);
    expect(JSON.stringify(scene)).not.toContain('alert(1)');
    expect(scene.nodes['code']?.props).toEqual({});
    expect(
      resolveProp({ type: 'binding', source: 'form', path: '__proto__.x' }, { sample: {} }),
    ).toBe('{form.__proto__.x}');
    expect(resolveProp({ type: 'binding', source: 'form', path: 'a' }, {})).toBe('{form.a}');
    expect(resolveProp({ type: 'string', key: 'k' }, { strings: { k: 'Hola' } })).toBe('Hola');
    expect(resolveProp({ type: 'string', key: 'k' }, {})).toBe('{k}');
    expect(resolveProp({ type: 'string', key: '__proto__' }, { strings: {} })).toBe('{__proto__}');
  });

  it('drops layout values that are not numbers or percentages', () => {
    expect(styleOf({ width: 'calc(1px)', height: 10 }, {})).toEqual({ height: 10 });
  });

  it('produces a scene the protocol accepts', () => {
    const message = {
      type: 'rnjb:render',
      scene: buildScene(screen),
      size: { width: 360, height: 760 },
      theme: 'dark',
    };
    expect(hostMessageSchema.safeParse(message).success).toBe(true);
    expect(hostMessageSchema.safeParse({ ...message, extra: 1 }).success).toBe(false);
    expect(frameMessageSchema.safeParse({ type: 'rnjb:ready' }).success).toBe(true);
    expect(frameMessageSchema.safeParse({ type: 'other' }).success).toBe(false);
  });
});

describe('shim registry (§7.4)', () => {
  it('reports the shims a library needs that are not registered', () => {
    const registry = new ShimRegistry().register('react-native-svg', {});
    expect(registry.missing(['react-native-svg', 'react-native-reanimated'])).toEqual([
      'react-native-reanimated',
    ]);
  });
});
