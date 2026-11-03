import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ComponentNode, SpacingTarget } from '@rnjb/core';
import { cx } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import {
  dragSpacing,
  handleValue,
  spacingHandles,
  spacingValues,
  stepSpacing,
  withHandleValue,
  type Box,
  type SpacingHandle,
} from './spacing-handles.ts';

interface SpacingOverlayProps {
  node: ComponentNode;
  rects: Record<string, Box>;
  /** Logical size of the overlay (the screen content area). */
  size: { width: number; height: number };
  scale: readonly number[] | undefined;
  /** Commits one value; `undefined` clears it. One call per drag, so undo takes one step. */
  onSetSpacing: (nodeId: string, target: SpacingTarget, value: number | undefined) => void;
}

interface Drag {
  handle: SpacingHandle;
  pointerId: number;
  startPointer: number;
  start: number;
  /** Overlay units per screen pixel at the moment the drag began. */
  perPixel: number;
  value: number;
}

const BAND = 'pointer-events-none absolute box-border border-solid';

/**
 * Margin, padding and gap of the selected node drawn over the preview, with a handle per side to
 * drag (§11.7). The preview itself updates when the drag ends; while dragging, the bands and the
 * value label follow the pointer. Values snap to the pack's scale and are free without one.
 */
export function SpacingOverlay({ node, rects, size, scale, onSetSpacing }: SpacingOverlayProps) {
  const i18n = useT();
  const rect = rects[node.id];
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>();
  if (!rect) return null;

  const stored = spacingValues(node);
  const values = drag ? withHandleValue(stored, drag.handle, drag.value) : stored;
  const direction = node.layout.flexDirection ?? 'column';
  const reverse = direction.endsWith('reverse');
  const axis = direction.startsWith('row') ? 'x' : 'y';
  const first = node.children[0] !== undefined ? rects[node.children[0]] : undefined;
  const second = node.children[1] !== undefined ? rects[node.children[1]] : undefined;
  const handles = spacingHandles(
    rect,
    values,
    size,
    first && second ? { axis, reverse, firstChild: first } : undefined,
  );
  const { margin: m, padding: p } = values;

  const commit = (handle: SpacingHandle, value: number) => {
    if (value === handleValue(handle, stored)) return;
    onSetSpacing(node.id, handle.target, value === 0 ? undefined : value);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, handle: SpacingHandle) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = rootRef.current?.getBoundingClientRect();
    const start = handleValue(handle, stored);
    setDrag({
      handle,
      pointerId: event.pointerId,
      startPointer: handle.axis === 'x' ? event.clientX : event.clientY,
      start,
      // The board is zoomed with a CSS transform: convert screen pixels to the overlay's units.
      perPixel: bounds && bounds.width > 0 ? size.width / bounds.width : 1,
      value: start,
    });
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const pointer = drag.handle.axis === 'x' ? event.clientX : event.clientY;
    const delta = (pointer - drag.startPointer) * drag.perPixel;
    const value = dragSpacing(drag.start, delta, drag.handle.sign, scale);
    if (value !== drag.value) setDrag({ ...drag, value });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const done = drag;
    setDrag(undefined);
    commit(done.handle, done.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, handle: SpacingHandle) => {
    const keys =
      handle.axis === 'x' ? { ArrowRight: 1, ArrowLeft: -1 } : { ArrowDown: 1, ArrowUp: -1 };
    const along = keys[event.key as keyof typeof keys] as 1 | -1 | undefined;
    if (along === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const grows = (along * handle.sign) as 1 | -1;
    commit(handle, stepSpacing(handleValue(handle, stored), grows, scale, event.shiftKey));
  };

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <div
        aria-hidden
        className={cx(BAND, 'border-warning/30')}
        style={{
          left: rect.x - m.left,
          top: rect.y - m.top,
          width: rect.width + m.left + m.right,
          height: rect.height + m.top + m.bottom,
          borderWidth: `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`,
        }}
      />
      <div
        aria-hidden
        className={cx(BAND, 'border-success/30')}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          borderWidth: `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`,
        }}
      />
      {first && second && values.gap > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute bg-accent/30"
          style={
            axis === 'x'
              ? {
                  left: reverse ? first.x - values.gap : first.x + first.width,
                  top: rect.y,
                  width: values.gap,
                  height: rect.height,
                }
              : {
                  left: rect.x,
                  top: reverse ? first.y - values.gap : first.y + first.height,
                  width: rect.width,
                  height: values.gap,
                }
          }
        />
      )}
      {handles.map((handle) => {
        const active = drag?.handle.target === handle.target;
        return (
          <button
            key={handle.target}
            type="button"
            aria-label={i18n.t('editor.spacing.adjust', { target: handle.target })}
            onPointerDown={(event) => onPointerDown(event, handle)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(event) => onKeyDown(event, handle)}
            onClick={(event) => event.stopPropagation()}
            className={cx(
              'pointer-events-auto absolute touch-none rounded-full border-0 shadow-[0_0_0_1px_var(--panel)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--selection-color)',
              handle.axis === 'x' ? 'h-4 w-1.5 cursor-ew-resize' : 'h-1.5 w-4 cursor-ns-resize',
              handle.kind === 'margin' && 'bg-warning',
              handle.kind === 'padding' && 'bg-success',
              handle.kind === 'gap' && 'bg-accent',
              active && 'ring-2 ring-(--selection-color)',
            )}
            style={{
              left: `calc(${handle.x}px + ${handle.ox}px * var(--inv-zoom))`,
              top: `calc(${handle.y}px + ${handle.oy}px * var(--inv-zoom))`,
              transform: 'translate(-50%, -50%) scale(var(--inv-zoom))',
            }}
          >
            {active && drag && (
              <span
                aria-hidden
                className="tabular pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-sm bg-panel px-1 font-mono text-2xs whitespace-nowrap text-fg shadow-[0_0_0_1px_var(--line)]"
              >
                {drag.value}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
