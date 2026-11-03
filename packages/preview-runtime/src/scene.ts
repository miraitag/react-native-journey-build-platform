import type { JsonValue, Layout, PropValue, Screen, Spacing, SpacingValue } from '@rnjb/core';
import type { Scene, SceneNode } from './protocol.ts';

type Display = string | number | boolean | null;

export interface SceneOptions {
  /** Sample data of the active screen state, used to show bindings (never evaluated). */
  sample?: Record<string, JsonValue>;
  /** Spacing tokens by `group.name`; unresolved tokens contribute 0. */
  tokens?: Record<string, number>;
  /** Document texts by message key; an unknown key is shown as `{key}`. */
  strings?: Record<string, string>;
  codeLabel?: string;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sampleAt(
  sample: Record<string, JsonValue> | undefined,
  path: string,
): JsonValue | undefined {
  let current: JsonValue | undefined = sample;
  for (const part of path.split('.')) {
    if (UNSAFE_KEYS.has(part) || current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current)
      ? current[Number.parseInt(part, 10)]
      : Object.hasOwn(current, part)
        ? current[part]
        : undefined;
  }
  return current;
}

const toDisplay = (value: JsonValue): Display =>
  value === null || typeof value !== 'object' ? value : JSON.stringify(value);

/**
 * Props become display values only (ADR 0005): `binding` shows its sample value or a marker and
 * `expression` is shown as text, so nothing from the document is ever executed in the preview.
 */
export function resolveProp(value: PropValue, options: SceneOptions): Display {
  switch (value.type) {
    case 'literal':
      return value.value;
    case 'string':
      return (
        (options.strings && Object.hasOwn(options.strings, value.key)
          ? options.strings[value.key]
          : undefined) ?? `{${value.key}}`
      );
    case 'token':
      return `${value.group}.${value.name}`;
    case 'icon':
      return value.name;
    case 'binding': {
      const found = sampleAt(options.sample, value.path);
      return found === undefined ? `{${value.source}.${value.path}}` : toDisplay(found);
    }
    case 'expression':
      return '{ƒ}';
  }
}

const space = (value: SpacingValue | undefined, tokens: Record<string, number> | undefined) =>
  value === undefined
    ? undefined
    : value.type === 'literal'
      ? value.value
      : (tokens?.[`${value.group}.${value.name}`] ?? 0);

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const PERCENT = /^\d+(\.\d+)?%$/;

export function styleOf(
  layout: Layout,
  spacing: Spacing,
  tokens?: Record<string, number>,
): Record<string, string | number> {
  const style: Record<string, string | number> = {};
  const keywords = [
    'flexDirection',
    'justifyContent',
    'alignItems',
    'alignSelf',
    'flexWrap',
    'flex',
    'flexGrow',
    'flexShrink',
  ] as const;
  for (const key of keywords) {
    const value = layout[key];
    if (value !== undefined) style[key] = value;
  }
  for (const key of ['width', 'height'] as const) {
    const value = layout[key];
    if (typeof value === 'number' || (typeof value === 'string' && PERCENT.test(value))) {
      style[key] = value;
    }
  }
  if (layout.position) style['position'] = layout.position;
  for (const kind of ['margin', 'padding'] as const) {
    for (const side of SIDES) {
      const resolved = space(spacing[kind]?.[side], tokens);
      if (resolved !== undefined)
        style[`${kind}${side[0]?.toUpperCase()}${side.slice(1)}`] = resolved;
    }
  }
  const gap = space(spacing.gap, tokens);
  if (gap !== undefined) style['gap'] = gap;
  return style;
}

/** Flat, serialisable snapshot of a screen for the preview iframe. Unreachable nodes are left out. */
export function buildScene(screen: Screen, options: SceneOptions = {}): Scene {
  const nodes: Scene['nodes'] = {};
  const stack = [screen.rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    const node = screen.nodes[id];
    if (!node || nodes[id]) continue;
    let entry: SceneNode;
    if (node.kind === 'component') {
      const props: SceneNode['props'] = {};
      for (const [name, value] of Object.entries(node.props))
        props[name] = resolveProp(value, options);
      entry = {
        id,
        kind: 'component',
        label: node.name ?? node.ref.component,
        ref: { package: node.ref.package, component: node.ref.component },
        props,
        style: styleOf(node.layout, node.spacing, options.tokens),
        children: node.children.filter((child) => screen.nodes[child] !== undefined),
      };
    } else {
      entry = {
        id,
        kind: 'code',
        label: node.name ?? options.codeLabel ?? 'code',
        props: {},
        style: {},
        children: node.children.filter((child) => screen.nodes[child] !== undefined),
      };
    }
    nodes[id] = entry;
    for (let index = entry.children.length - 1; index >= 0; index--)
      stack.push(entry.children[index] as string);
  }
  return { screenId: screen.id, rootId: screen.rootId, nodes };
}
