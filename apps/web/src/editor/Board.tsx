import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Focus, Maximize, Minus, Pencil, Play, Plus } from 'lucide-react';
import type { DocumentNode, RnjbDocument, Screen, SpacingTarget } from '@rnjb/core';
import type { Device } from '@rnjb/pack-schema';
import { Badge, Button, EmptyState, IconButton, cx } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { MOD } from '../app/dialogs-store.ts';
import { useDevices, osVersionOf } from '../services/device-store.ts';
import { useLibraries } from '../services/library-store.ts';
import { useSimulatedErrors } from './simulated-errors-store.ts';
import { withSimulatedErrors } from './simulate-errors.ts';
import { deviceView, pickChromeStyle, type ChromeStyle, type DeviceView } from './chrome-style.ts';
import { DeviceChrome } from './DeviceChrome.tsx';
import { CompareStrip } from './CompareStrip.tsx';
import { PreviewFrame } from './PreviewFrame.tsx';
import { findNavigation } from './prototype.ts';
import type { DraggedComponent } from './insert-component.ts';
import {
  DEFAULT_FRAME_SIZE,
  boardScale,
  boundsOf,
  type FrameSize,
  type Rect,
} from './board-geometry.ts';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;
/** Below this zoom frames drop their structure and show only name and size (§5.2). */
const LOD_ZOOM = 0.35;
const LABEL_HEIGHT = 28;
const MAX_ROWS = 28;
const COLUMNS = 10;

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export const positionOf = (
  document: RnjbDocument,
  screen: Screen,
  index: number,
  size: FrameSize = DEFAULT_FRAME_SIZE,
) => {
  const saved = document.board.positions[screen.id];
  if (!saved) {
    return {
      x: (index % COLUMNS) * (size.width + 120),
      y: Math.floor(index / COLUMNS) * (size.height + 200),
    };
  }
  const scale = boardScale(size);
  return { x: saved.x * scale, y: saved.y * scale };
};

interface BoardProps {
  document: RnjbDocument;
  selectedScreenId: string | undefined;
  selectedNodeId: string | undefined;
  onSelect: (screenId: string, nodeId?: string) => void;
  /** Absent when the document is read-only. */
  onMoveScreen?: (screenId: string, position: { x: number; y: number }) => void;
  previewTheme?: 'light' | 'dark';
  stateId?: string | undefined;
  /** Drop handlers for catalog components; absent when the document is read-only. */
  onInsertComponent?: ((item: DraggedComponent, targetNodeId?: string) => void) | undefined;
  canInsertComponent?: ((item: DraggedComponent, targetNodeId?: string) => boolean) | undefined;
  /** Commits the text typed on the canvas; absent when the document is read-only. */
  onEditText?: ((nodeId: string, prop: string, text: string) => void) | undefined;
  /** Commits a spacing value dragged on the canvas; absent when the document is read-only. */
  onSetSpacing?:
    ((nodeId: string, target: SpacingTarget, value: number | undefined) => void) | undefined;
}

/**
 * Infinite board. The camera lives in a ref and is written straight to the DOM, so panning and
 * zooming never re-render React; only the visible-frame set and the LOD flag do, when they change.
 */
export function Board({
  document,
  selectedScreenId,
  selectedNodeId,
  onSelect,
  onMoveScreen,
  previewTheme = 'light',
  stateId,
  onInsertComponent,
  canInsertComponent,
  onEditText,
  onSetSpacing,
}: BoardProps) {
  const i18n = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLButtonElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const frameRequest = useRef(0);
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  const [simplified, setSimplified] = useState(false);
  const device = useDevices((state) => state.devices.find((d) => d.id === state.selectedId));
  const simulated = useSimulatedErrors((state) => state.fields);
  const libraryPacks = useLibraries((state) => state.packs);
  const chromeStyles = useDevices((state) => state.chromeStyles);
  const osVersions = useDevices((state) => state.osVersions);
  const orientation = useDevices((state) => state.orientation);
  const posture = useDevices((state) => (device ? state.postures[device.id] : undefined));
  const chromeStyle = device
    ? pickChromeStyle(chromeStyles, device, osVersionOf(device, osVersions))
    : undefined;
  const view = useMemo(
    () => (device ? deviceView(device, orientation, posture) : undefined),
    [device, orientation, posture],
  );
  const width = view?.width ?? DEFAULT_FRAME_SIZE.width;
  const height = view?.height ?? DEFAULT_FRAME_SIZE.height;
  const size = useMemo<FrameSize>(() => ({ width, height }), [width, height]);
  const sizeRef = useRef(size);

  const frames = document.screens.map((screen, index) => ({
    screen,
    ...positionOf(document, screen, index, size),
  }));
  const framesRef = useRef(frames);
  const moveScreen = (screenId: string, position: { x: number; y: number }) => {
    const scale = boardScale(size);
    onMoveScreen?.(screenId, {
      x: Math.round(position.x / scale),
      y: Math.round(position.y / scale),
    });
  };
  const selectedScreen = document.screens.find((screen) => screen.id === selectedScreenId);

  const updateVisibility = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { x, y, zoom } = camera.current;
    const frameSize = sizeRef.current;
    const margin = frameSize.width;
    const view: Rect = {
      x: -x / zoom - margin,
      y: -y / zoom - margin,
      width: viewport.clientWidth / zoom + margin * 2,
      height: viewport.clientHeight / zoom + margin * 2,
    };
    const next = new Set<string>();
    for (const frame of framesRef.current) {
      if (
        frame.x + frameSize.width >= view.x &&
        frame.x <= view.x + view.width &&
        frame.y + frameSize.height >= view.y - LABEL_HEIGHT &&
        frame.y - LABEL_HEIGHT <= view.y + view.height
      ) {
        next.add(frame.screen.id);
      }
    }
    setVisible((previous) =>
      previous.size === next.size && [...next].every((id) => previous.has(id)) ? previous : next,
    );
    setSimplified(zoom < LOD_ZOOM);
  }, []);

  const apply = useCallback(() => {
    const { x, y, zoom } = camera.current;
    if (worldRef.current) {
      worldRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`;
      // Labels and selection rings stay a constant on-screen size at any zoom.
      worldRef.current.style.setProperty('--zoom', String(zoom));
      worldRef.current.style.setProperty('--inv-zoom', String(1 / zoom));
    }
    const viewport = viewportRef.current;
    if (viewport) {
      const grid = 24 * zoom;
      viewport.style.backgroundSize = `${grid}px ${grid}px`;
      viewport.style.backgroundPosition = `${x}px ${y}px`;
    }
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(updateVisibility);
  }, [updateVisibility]);

  const zoomAt = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
      const { x, y, zoom } = camera.current;
      const target = clampZoom(nextZoom);
      camera.current = {
        zoom: target,
        x: px - ((px - x) / zoom) * target,
        y: py - ((py - y) / zoom) * target,
      };
      apply();
    },
    [apply],
  );

  const fitTo = useCallback(
    (bounds: Rect) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const padding = 48;
      const width = Math.max(1, viewport.clientWidth - padding * 2);
      const height = Math.max(1, viewport.clientHeight - padding * 2);
      const zoom = clampZoom(
        Math.min(width / bounds.width, height / (bounds.height + LABEL_HEIGHT), 1),
      );
      camera.current = {
        zoom,
        x: (viewport.clientWidth - bounds.width * zoom) / 2 - bounds.x * zoom,
        y: (viewport.clientHeight - (bounds.height - LABEL_HEIGHT) * zoom) / 2 - bounds.y * zoom,
      };
      apply();
    },
    [apply],
  );

  const fitAll = useCallback(() => fitTo(boundsOf(framesRef.current, sizeRef.current)), [fitTo]);

  const fitScreen = useCallback(
    (screenId: string | undefined) => {
      const frame = framesRef.current.find((candidate) => candidate.screen.id === screenId);
      if (frame) fitTo(boundsOf([frame], sizeRef.current));
    },
    [fitTo],
  );

  const [prototype, setPrototype] = useState(false);
  const [focus, setFocus] = useState(false);
  const toggleFocus = () => {
    const next = !focus;
    setFocus(next);
    if (next && selectedScreenId) fitScreen(selectedScreenId);
    else fitAll();
  };
  const documentRef = useRef(document);
  documentRef.current = document;
  // Prototype mode: clicking a trigger follows its connection; anything else only selects the screen.
  const selectInBoard = useCallback(
    (screenId: string, nodeId?: string) => {
      if (!prototype || !nodeId) return onSelect(screenId, nodeId);
      const current = documentRef.current;
      const source = current.screens.find((screen) => screen.id === screenId);
      const connection = source && findNavigation(source, current.connections, nodeId);
      if (!connection) return onSelect(screenId);
      onSelect(connection.toScreenId);
      fitScreen(connection.toScreenId);
    },
    [prototype, onSelect, fitScreen],
  );

  // Keep the frame list the camera callbacks read in sync, and re-cull when it changes.
  useLayoutEffect(() => {
    framesRef.current = frames;
    sizeRef.current = size;
    updateVisibility();
  });

  // A different device changes every frame's size. Editing a screen up close keeps that screen
  // framed; otherwise the whole board is framed again.
  const sizeKey = `${size.width}x${size.height}`;
  const selectedRef = useRef(selectedScreenId);
  selectedRef.current = selectedScreenId;
  useLayoutEffect(() => {
    if (camera.current.zoom >= LOD_ZOOM && selectedRef.current) fitScreen(selectedRef.current);
    else fitAll();
  }, [sizeKey, fitAll, fitScreen]);

  useLayoutEffect(() => {
    fitAll();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => apply());
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRequest.current);
    };
  }, [fitAll, apply]);

  // Bring a screen selected elsewhere (Pantallas, Problemas) into view.
  useEffect(() => {
    const viewport = viewportRef.current;
    const frame = framesRef.current.find((candidate) => candidate.screen.id === selectedScreenId);
    if (!viewport || !frame) return;
    const { x, y, zoom } = camera.current;
    const frameSize = sizeRef.current;
    const left = frame.x * zoom + x;
    const top = (frame.y - LABEL_HEIGHT) * zoom + y;
    const inside =
      left >= 0 &&
      top >= 0 &&
      left + frameSize.width * zoom <= viewport.clientWidth &&
      top + (frameSize.height + LABEL_HEIGHT) * zoom <= viewport.clientHeight;
    if (!inside) {
      camera.current = {
        zoom,
        x: viewport.clientWidth / 2 - (frame.x + frameSize.width / 2) * zoom,
        y: viewport.clientHeight / 2 - (frame.y + frameSize.height / 2) * zoom,
      };
      apply();
    }
  }, [selectedScreenId, apply]);

  // Wheel: pinch / ctrl+wheel zooms at the cursor, plain wheel pans. Non-passive to stop page zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(camera.current.zoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
      } else {
        camera.current = {
          ...camera.current,
          x: camera.current.x - event.deltaX,
          y: camera.current.y - event.deltaY,
        };
        apply();
      }
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [zoomAt, apply]);

  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | undefined>(
    undefined,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const onBackground = event.target === viewportRef.current || event.target === worldRef.current;
    if (event.button === 1 || (event.button === 0 && onBackground)) {
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 3) return;
    state.moved = true;
    state.x = event.clientX;
    state.y = event.clientY;
    camera.current = { ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy };
    apply();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === '=' || event.key === '+')) zoomAt(camera.current.zoom * 1.25);
    else if (mod && event.key === '-') zoomAt(camera.current.zoom / 1.25);
    else if (mod && event.key === '0') zoomAt(1);
    else if (event.shiftKey && event.code === 'Digit1') fitAll();
    else if (event.shiftKey && event.code === 'Digit2') fitScreen(selectedScreenId);
    else return;
    event.preventDefault();
  };

  if (document.screens.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <EmptyState title={i18n.t('editor.board.emptyTitle')}>
          {i18n.t('editor.board.emptyBody')}
        </EmptyState>
      </div>
    );
  }

  const frameById = new Map(frames.map((frame) => [frame.screen.id, frame]));
  const getZoom = () => camera.current.zoom;

  return (
    <div className="relative h-full overflow-hidden">
      <div
        ref={viewportRef}
        role="region"
        aria-label={i18n.t('editor.board.label')}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 touch-none overflow-hidden bg-canvas focus-visible:outline-none"
        style={{ backgroundImage: 'radial-gradient(circle, var(--line) 1px, transparent 1px)' }}
      >
        <div ref={worldRef} className="absolute top-0 left-0 origin-top-left will-change-transform">
          <svg
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            width={1}
            height={1}
            aria-hidden
          >
            <defs>
              <marker
                id="board-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="8"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--fg-subtle)" />
              </marker>
            </defs>
            {focus
              ? null
              : document.connections.map((connection) => {
                  const from = frameById.get(connection.fromScreenId);
                  const to = frameById.get(connection.toScreenId);
                  if (!from || !to || from === to) return null;
                  return (
                    <path
                      key={connection.id}
                      d={connectionPath(from, to, size)}
                      fill="none"
                      stroke="var(--fg-subtle)"
                      strokeOpacity={0.55}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      markerEnd="url(#board-arrow)"
                    />
                  );
                })}
          </svg>
          {frames.map(({ screen, x, y }) =>
            visible.has(screen.id) && (!focus || screen.id === selectedScreenId) ? (
              <Frame
                key={screen.id}
                screen={withSimulatedErrors(
                  screen,
                  document.forms,
                  simulated,
                  libraryPacks,
                  document.strings,
                  i18n.t('editor.forms.simulatedError'),
                )}
                x={x}
                y={y}
                size={size}
                device={device}
                view={view}
                chromeStyle={chromeStyle}
                previewTheme={previewTheme}
                stateId={stateId}
                initial={document.board.initialScreenId === screen.id}
                simplified={simplified}
                selected={screen.id === selectedScreenId}
                selectedNodeId={screen.id === selectedScreenId ? selectedNodeId : undefined}
                onSelect={selectInBoard}
                onFocusScreen={fitScreen}
                onMove={prototype || !onMoveScreen ? undefined : moveScreen}
                onInsertComponent={prototype ? undefined : onInsertComponent}
                canInsertComponent={prototype ? undefined : canInsertComponent}
                onEditText={prototype ? undefined : onEditText}
                onSetSpacing={prototype ? undefined : onSetSpacing}
                strings={document.strings}
                getZoom={getZoom}
              />
            ) : null,
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <Button
          size="sm"
          variant={prototype ? 'primary' : 'secondary'}
          aria-pressed={prototype}
          className="pointer-events-auto"
          onClick={() => setPrototype((value) => !value)}
        >
          {prototype ? <Pencil size={13} aria-hidden /> : <Play size={13} aria-hidden />}
          {i18n.t(prototype ? 'editor.board.prototypeOff' : 'editor.board.prototypeOn')}
        </Button>
        <Button
          size="sm"
          variant={focus ? 'primary' : 'secondary'}
          aria-pressed={focus}
          className="pointer-events-auto"
          onClick={toggleFocus}
        >
          <Focus size={13} aria-hidden />
          {i18n.t('editor.board.focus')}
        </Button>
        <Badge className="pointer-events-auto shadow-[0_0_0_1px_var(--line-subtle)]">
          {i18n.t('editor.board.previewPending')}
        </Badge>
      </div>

      {selectedScreen && !simplified && (
        <CompareStrip
          screen={selectedScreen}
          previewTheme={previewTheme}
          stateId={stateId}
          strings={document.strings}
        />
      )}

      <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-md bg-panel p-0.5 shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]">
        <IconButton
          label={i18n.t('editor.board.zoomOut')}
          shortcut={`${MOD} −`}
          tooltipSide="top"
          icon={<Minus size={14} />}
          onClick={() => zoomAt(camera.current.zoom / 1.25)}
        />
        <button
          ref={zoomLabelRef}
          type="button"
          title={`${i18n.t('editor.board.zoom')} 100% (${MOD} 0)`}
          onClick={() => zoomAt(1)}
          className="tabular h-[var(--control-h-sm)] w-12 rounded-md text-xs text-fg-muted hover:bg-hover hover:text-fg"
        >
          100%
        </button>
        <IconButton
          label={i18n.t('editor.board.zoomIn')}
          shortcut={`${MOD} +`}
          tooltipSide="top"
          icon={<Plus size={14} />}
          onClick={() => zoomAt(camera.current.zoom * 1.25)}
        />
        <IconButton
          label={i18n.t('editor.board.fit')}
          shortcut="⇧ 1"
          tooltipSide="top"
          icon={<Maximize size={13} />}
          onClick={fitAll}
        />
      </div>
    </div>
  );
}

interface FrameProps {
  screen: Screen;
  x: number;
  y: number;
  size: FrameSize;
  device: Device | undefined;
  view: DeviceView | undefined;
  chromeStyle: ChromeStyle | undefined;
  previewTheme: 'light' | 'dark';
  stateId: string | undefined;
  initial: boolean;
  simplified: boolean;
  selected: boolean;
  selectedNodeId: string | undefined;
  onSelect: (screenId: string, nodeId?: string) => void;
  onFocusScreen: (screenId: string) => void;
  onMove: ((screenId: string, position: { x: number; y: number }) => void) | undefined;
  onInsertComponent: BoardProps['onInsertComponent'];
  canInsertComponent: BoardProps['canInsertComponent'];
  onEditText: BoardProps['onEditText'];
  onSetSpacing: BoardProps['onSetSpacing'];
  strings: Record<string, string>;
  getZoom: () => number;
}

const SNAP = 8;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/** Forward links leave the right edge; links to an earlier row or column drop from the bottom edge. */
function connectionPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: FrameSize,
): string {
  if (to.x >= from.x + size.width) {
    const x1 = from.x + size.width;
    const y1 = from.y + size.height / 2;
    const x2 = to.x;
    const y2 = to.y + size.height / 2;
    const bend = Math.max(40, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
  }
  const x1 = from.x + size.width / 2;
  const y1 = to.y > from.y ? from.y + size.height : from.y;
  const x2 = to.x + size.width / 2;
  const y2 = to.y > from.y ? to.y - LABEL_HEIGHT : to.y + size.height;
  const bend = Math.max(60, Math.abs(y2 - y1) / 2) * (to.y > from.y ? 1 : -1);
  return `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;
}

function Frame({
  screen,
  x,
  y,
  size,
  device,
  view,
  chromeStyle,
  previewTheme,
  stateId,
  initial,
  simplified,
  selected,
  selectedNodeId,
  onSelect,
  onFocusScreen,
  onMove,
  onInsertComponent,
  canInsertComponent,
  onEditText,
  onSetSpacing,
  strings,
  getZoom,
}: FrameProps) {
  const i18n = useT();
  const nodeCount = Object.keys(screen.nodes).length;
  const rootRef = useRef<HTMLDivElement>(null);
  const move = useRef<
    { pointerId: number; startX: number; startY: number; dx: number; dy: number } | undefined
  >(undefined);

  // Dragging the label moves the frame: the DOM follows the pointer, the document changes once.
  const onLabelPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onMove || event.button !== 0) return;
    move.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onLabelPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = move.current;
    if (state?.pointerId !== event.pointerId) return;
    const zoom = getZoom();
    const dx = (event.clientX - state.startX) / zoom;
    const dy = (event.clientY - state.startY) / zoom;
    if (state.dx === 0 && state.dy === 0 && Math.hypot(dx * zoom, dy * zoom) < 3) return;
    state.dx = snap(x + dx) - x;
    state.dy = snap(y + dy) - y;
    if (rootRef.current) {
      rootRef.current.style.transform = `translate(${state.dx}px, ${state.dy}px)`;
    }
  };
  const onLabelPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = move.current;
    if (state?.pointerId !== event.pointerId) return;
    move.current = undefined;
    if (rootRef.current) rootRef.current.style.transform = '';
    if (state.dx !== 0 || state.dy !== 0) onMove?.(screen.id, { x: x + state.dx, y: y + state.dy });
  };

  return (
    <div ref={rootRef} className="absolute" style={{ left: x, top: y, width: size.width }}>
      <button
        type="button"
        onClick={() => onSelect(screen.id)}
        onDoubleClick={() => onFocusScreen(screen.id)}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={onLabelPointerUp}
        onPointerCancel={onLabelPointerUp}
        style={{ width: `calc(var(--zoom) * ${size.width}px)` }}
        className={cx(
          'absolute bottom-full left-0 flex h-6 origin-bottom-left scale-(--inv-zoom) items-center gap-1.5 pb-1 text-left text-xs font-medium',
          onMove && 'cursor-grab active:cursor-grabbing',
          selected ? 'text-accent-fg' : 'text-fg-muted hover:text-fg',
        )}
      >
        <span className="truncate">{screen.name}</span>
        {initial && <Badge tone="accent">{i18n.t('editor.screens.initial')}</Badge>}
      </button>
      <div
        onClick={() => onSelect(screen.id)}
        className={cx(
          'relative overflow-hidden bg-panel',
          selected
            ? 'shadow-[0_0_0_calc(var(--selection-width)*var(--inv-zoom))_var(--selection-color),0_0_0_calc((var(--selection-width)+4px)*var(--inv-zoom))_var(--selection-halo)]'
            : 'shadow-[0_0_0_calc(1px*var(--inv-zoom))_var(--line),var(--shadow-frame)]',
        )}
        style={{ height: size.height, borderRadius: device?.cornerRadius ?? 20 }}
      >
        {device && view && !simplified && (
          <DeviceChrome device={device} view={view} style={chromeStyle} />
        )}
        {simplified ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-fg-subtle">
            <span className="tabular text-[calc(12px*var(--inv-zoom))] leading-[1.3] whitespace-nowrap">
              {i18n.t('editor.board.structure', { count: nodeCount })}
            </span>
          </div>
        ) : selected ? (
          <PreviewFrame
            screen={screen}
            size={size}
            insets={{ top: view?.insets.top ?? 0, bottom: view?.insets.bottom ?? 0 }}
            theme={previewTheme}
            stateId={stateId}
            selectedNodeId={selectedNodeId}
            onSelectNode={(nodeId) => onSelect(screen.id, nodeId)}
            onInsertComponent={onInsertComponent}
            canInsertComponent={canInsertComponent}
            strings={strings}
            onEditText={onEditText}
            onSetSpacing={onSetSpacing}
            fold={view?.separating ? view.hinge : undefined}
            fallback={
              <FrameStructure
                screen={screen}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => onSelect(screen.id, nodeId)}
              />
            }
          />
        ) : (
          <FrameStructure
            screen={screen}
            selectedNodeId={selectedNodeId}
            onSelectNode={(nodeId) => onSelect(screen.id, nodeId)}
          />
        )}
      </div>
    </div>
  );
}

const nodeLabel = (node: DocumentNode, codeLabel: string): string =>
  node.kind === 'component' ? (node.name ?? node.ref.component) : (node.name ?? codeLabel);

export function flattenTree(
  screen: Screen,
  limit = Infinity,
): { node: DocumentNode; depth: number }[] {
  const rows: { node: DocumentNode; depth: number }[] = [];
  const stack: { id: string; depth: number }[] = [{ id: screen.rootId, depth: 0 }];
  while (stack.length > 0 && rows.length < limit) {
    const { id, depth } = stack.pop() as { id: string; depth: number };
    const node = screen.nodes[id];
    if (!node) continue;
    rows.push({ node, depth });
    for (let index = node.children.length - 1; index >= 0; index--) {
      stack.push({ id: node.children[index] as string, depth: depth + 1 });
    }
  }
  return rows;
}

/** Structural view of the screen tree; the real preview arrives with library bundles (F6). */
function FrameStructure({
  screen,
  selectedNodeId,
  onSelectNode,
}: {
  screen: Screen;
  selectedNodeId: string | undefined;
  onSelectNode: (nodeId: string) => void;
}) {
  const i18n = useT();
  const rows = flattenTree(screen, MAX_ROWS);
  const total = Object.keys(screen.nodes).length;
  const codeLabel = i18n.t('editor.layers.code');
  return (
    <div className="flex flex-col gap-px p-3 pt-10">
      {rows.map(({ node, depth }) => (
        <div
          key={node.id}
          onClick={(event) => {
            event.stopPropagation();
            onSelectNode(node.id);
          }}
          style={{ marginLeft: Math.min(depth, 8) * 12 }}
          className={cx(
            'flex h-6 items-center gap-2 rounded-sm px-2 font-mono text-2xs',
            node.id === selectedNodeId
              ? 'bg-accent-subtle text-accent-fg shadow-[inset_0_0_0_1.5px_var(--selection-color)]'
              : node.kind === 'code'
                ? 'border border-dashed border-line text-fg-muted hover:bg-hover'
                : 'bg-canvas text-fg-muted hover:bg-hover hover:text-fg',
          )}
        >
          <span className="truncate">{nodeLabel(node, codeLabel)}</span>
        </div>
      ))}
      {total > rows.length && (
        <p className="px-2 pt-1 text-2xs text-fg-subtle">
          {i18n.t('editor.board.more', { count: total - rows.length })}
        </p>
      )}
    </div>
  );
}
