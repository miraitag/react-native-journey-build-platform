import { snapToScale, type ComponentNode, type SpacingTarget } from '@rnjb/core';

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpacingValues {
  margin: Record<Side, number>;
  padding: Record<Side, number>;
  gap: number;
}

/** A drag handle of the spacing overlay (§11.7). */
export interface SpacingHandle {
  target: SpacingTarget;
  kind: 'margin' | 'padding' | 'gap';
  /** The pointer axis that changes the value. */
  axis: 'x' | 'y';
  /** +1 when moving along the axis grows the value, -1 when it shrinks it. */
  sign: 1 | -1;
  /** Centre in the overlay's own units (logical pixels of the screen). */
  x: number;
  y: number;
  /** Offset in screen pixels, so handles keep their size and distance at any zoom. */
  ox: number;
  oy: number;
}

const OFFSET = 8;
// Padding handles sit inside the node; on small nodes they would cover it.
const MIN_INNER = 32;
const num = (value: { type: string; value?: unknown } | undefined): number =>
  value?.type === 'literal' && typeof value.value === 'number' ? value.value : 0;

/**
 * Current spacing of a node. Token values count as 0 here: their size is not known to the
 * editor, and dragging replaces them with a literal (the inspector behaves the same way).
 */
export function spacingValues(node: ComponentNode): SpacingValues {
  const side = (kind: 'margin' | 'padding', name: Side) => num(node.spacing[kind]?.[name]);
  const group = (kind: 'margin' | 'padding') =>
    Object.fromEntries(SIDES.map((name) => [name, side(kind, name)])) as Record<Side, number>;
  return { margin: group('margin'), padding: group('padding'), gap: num(node.spacing.gap) };
}

/** New value for a drag of `delta` logical pixels: whole pixels, never negative, on the scale. */
export function dragSpacing(
  start: number,
  delta: number,
  sign: 1 | -1,
  scale: readonly number[] | undefined,
): number {
  return snapToScale(Math.max(0, Math.round(start + sign * delta)), scale);
}

/**
 * Keyboard step: the next (or previous) step of the pack's scale, or ±1 px (±8 with Shift) when
 * the pack has none. Stays put at the ends of the scale.
 */
export function stepSpacing(
  current: number,
  direction: 1 | -1,
  scale: readonly number[] | undefined,
  big: boolean,
): number {
  if (scale && scale.length > 0) {
    const ordered = [...scale].sort((a, b) => a - b);
    const next =
      direction === 1
        ? ordered.find((step) => step > current)
        : [...ordered].reverse().find((step) => step < current);
    return next ?? current;
  }
  return Math.max(0, current + direction * (big ? 8 : 1));
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 6), Math.max(6, max - 6));

/**
 * Handles for the selected node: margin outside the margin edge, padding inside the padding
 * edge, and gap between the first two children. Positions follow the values being dragged.
 */
export function spacingHandles(
  rect: Box,
  values: SpacingValues,
  bounds: { width: number; height: number },
  gap?: { axis: 'x' | 'y'; reverse: boolean; firstChild: Box },
): SpacingHandle[] {
  const midX = clamp(rect.x + rect.width / 2, bounds.width);
  const midY = clamp(rect.y + rect.height / 2, bounds.height);
  const { margin: m, padding: p } = values;
  const all: SpacingHandle[] = [
    {
      target: 'margin.left',
      kind: 'margin',
      axis: 'x',
      sign: -1,
      x: clamp(rect.x - m.left, bounds.width),
      y: midY,
      ox: -OFFSET,
      oy: 0,
    },
    {
      target: 'margin.right',
      kind: 'margin',
      axis: 'x',
      sign: 1,
      x: clamp(rect.x + rect.width + m.right, bounds.width),
      y: midY,
      ox: OFFSET,
      oy: 0,
    },
    {
      target: 'margin.top',
      kind: 'margin',
      axis: 'y',
      sign: -1,
      x: midX,
      y: clamp(rect.y - m.top, bounds.height),
      ox: 0,
      oy: -OFFSET,
    },
    {
      target: 'margin.bottom',
      kind: 'margin',
      axis: 'y',
      sign: 1,
      x: midX,
      y: clamp(rect.y + rect.height + m.bottom, bounds.height),
      ox: 0,
      oy: OFFSET,
    },
    {
      target: 'padding.left',
      kind: 'padding',
      axis: 'x',
      sign: 1,
      x: clamp(rect.x + p.left, bounds.width),
      y: midY,
      ox: OFFSET,
      oy: 0,
    },
    {
      target: 'padding.right',
      kind: 'padding',
      axis: 'x',
      sign: -1,
      x: clamp(rect.x + rect.width - p.right, bounds.width),
      y: midY,
      ox: -OFFSET,
      oy: 0,
    },
    {
      target: 'padding.top',
      kind: 'padding',
      axis: 'y',
      sign: 1,
      x: midX,
      y: clamp(rect.y + p.top, bounds.height),
      ox: 0,
      oy: OFFSET,
    },
    {
      target: 'padding.bottom',
      kind: 'padding',
      axis: 'y',
      sign: -1,
      x: midX,
      y: clamp(rect.y + rect.height - p.bottom, bounds.height),
      ox: 0,
      oy: -OFFSET,
    },
  ];
  const handles = all.filter(
    (h) => h.kind !== 'padding' || (h.axis === 'x' ? rect.width : rect.height) >= MIN_INNER,
  );
  if (gap) {
    const { firstChild: child, axis, reverse } = gap;
    const half = values.gap / 2;
    const sign = reverse ? -1 : 1;
    handles.push(
      axis === 'x'
        ? {
            target: 'gap',
            kind: 'gap',
            axis,
            sign,
            x: reverse ? child.x - half : child.x + child.width + half,
            y: midY,
            ox: 0,
            oy: 0,
          }
        : {
            target: 'gap',
            kind: 'gap',
            axis,
            sign,
            x: midX,
            y: reverse ? child.y - half : child.y + child.height + half,
            ox: 0,
            oy: 0,
          },
    );
  }
  return handles;
}

/** Value a handle currently shows. */
export function handleValue(handle: SpacingHandle, values: SpacingValues): number {
  if (handle.target === 'gap') return values.gap;
  const [kind, side] = handle.target.split('.') as ['margin' | 'padding', Side];
  return values[kind][side];
}

/** Returns `values` with the handle's target replaced. */
export function withHandleValue(
  values: SpacingValues,
  handle: SpacingHandle,
  value: number,
): SpacingValues {
  if (handle.target === 'gap') return { ...values, gap: value };
  const [kind, side] = handle.target.split('.') as ['margin' | 'padding', Side];
  return { ...values, [kind]: { ...values[kind], [side]: value } };
}
