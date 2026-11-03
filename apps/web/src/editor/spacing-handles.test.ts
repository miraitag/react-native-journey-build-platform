import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@rnjb/core';
import {
  dragSpacing,
  handleValue,
  spacingHandles,
  spacingValues,
  stepSpacing,
  withHandleValue,
} from './spacing-handles.ts';

const node = (spacing: ComponentNode['spacing']): ComponentNode => ({
  id: 'n',
  kind: 'component',
  ref: { package: 'p', component: 'C', version: '1.0.0' },
  props: {},
  children: [],
  layout: {},
  spacing,
});

describe('spacingValues', () => {
  it('reads literals and counts tokens as 0', () => {
    const values = spacingValues(
      node({
        padding: {
          left: { type: 'literal', value: 12 },
          top: { type: 'token', group: 'space', name: 'md' },
        },
        gap: { type: 'literal', value: 4 },
      }),
    );
    expect(values.padding.left).toBe(12);
    expect(values.padding.top).toBe(0);
    expect(values.gap).toBe(4);
    expect(values.margin.left).toBe(0);
  });
});

describe('dragSpacing', () => {
  it('grows or shrinks by the sign, never below 0', () => {
    expect(dragSpacing(10, 6, 1, undefined)).toBe(16);
    expect(dragSpacing(10, 6, -1, undefined)).toBe(4);
    expect(dragSpacing(2, 50, -1, undefined)).toBe(0);
  });

  it('rounds to whole pixels and snaps to the pack scale', () => {
    expect(dragSpacing(0, 5.6, 1, undefined)).toBe(6);
    expect(dragSpacing(0, 13, 1, [0, 4, 8, 16])).toBe(16);
    expect(dragSpacing(0, 5, 1, [0, 4, 8, 16])).toBe(4);
  });
});

describe('stepSpacing', () => {
  it('moves one pixel, or 8 with Shift, when there is no scale', () => {
    expect(stepSpacing(5, 1, undefined, false)).toBe(6);
    expect(stepSpacing(5, -1, undefined, true)).toBe(0);
  });

  it('walks the scale and stops at its ends', () => {
    const scale = [8, 0, 16, 4];
    expect(stepSpacing(4, 1, scale, false)).toBe(8);
    expect(stepSpacing(5, -1, scale, false)).toBe(4);
    expect(stepSpacing(16, 1, scale, false)).toBe(16);
    expect(stepSpacing(0, -1, scale, false)).toBe(0);
  });
});

describe('spacingHandles', () => {
  const rect = { x: 20, y: 40, width: 100, height: 60 };
  const bounds = { width: 390, height: 800 };
  const values = spacingValues(
    node({
      margin: { left: { type: 'literal', value: 10 } },
      padding: { top: { type: 'literal', value: 6 } },
    }),
  );

  it('places margin outside and padding inside, following the values', () => {
    const handles = spacingHandles(rect, values, bounds);
    const get = (target: string) => handles.find((handle) => handle.target === target);
    expect(get('margin.left')).toMatchObject({ x: 10, ox: -8, sign: -1 });
    expect(get('padding.top')).toMatchObject({ y: 46, oy: 8, sign: 1 });
    expect(get('padding.bottom')).toMatchObject({ y: 100, sign: -1 });
    expect(handles).toHaveLength(8);
  });

  it('adds a gap handle on the first gap, mirrored for reversed directions', () => {
    const child = { x: 20, y: 40, width: 30, height: 60 };
    const forward = spacingHandles(rect, { ...values, gap: 10 }, bounds, {
      axis: 'x',
      reverse: false,
      firstChild: child,
    });
    expect(forward.at(-1)).toMatchObject({ target: 'gap', axis: 'x', sign: 1, x: 55 });
    const reversed = spacingHandles(rect, { ...values, gap: 10 }, bounds, {
      axis: 'x',
      reverse: true,
      firstChild: child,
    });
    expect(reversed.at(-1)).toMatchObject({ sign: -1, x: 15 });
  });
});

describe('handleValue / withHandleValue', () => {
  it('round-trips a handle value without touching the rest', () => {
    const values = spacingValues(node({}));
    const handle = spacingHandles({ x: 0, y: 0, width: 50, height: 50 }, values, {
      width: 100,
      height: 100,
    }).find((candidate) => candidate.target === 'padding.left')!;
    const next = withHandleValue(values, handle, 12);
    expect(handleValue(handle, next)).toBe(12);
    expect(next.padding.right).toBe(0);
    expect(values.padding.left).toBe(0);
  });
});
