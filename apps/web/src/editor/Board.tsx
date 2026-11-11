import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Focus,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Workflow,
  X,
} from 'lucide-react';
import type { DocumentNode, RnjbDocument, Screen, SpacingTarget } from '@rnjb/core';
import type { Device } from '@rnjb/pack-schema';
import { Badge, Button, EmptyState, IconButton, cx } from '@rnjb/ui';
import { usePreferences, useT } from '../app/preferences.ts';
import { MOD, useDialogs } from '../app/dialogs-store.ts';
import { isTyping, onCanvas } from '../app/focus.ts';
import { useDevices, osVersionOf } from '../services/device-store.ts';
import { useLibraries } from '../services/library-store.ts';
import { useSimulatedErrors } from './simulated-errors-store.ts';
import { withSimulatedErrors } from './simulate-errors.ts';
import { deviceView, pickChromeStyle, type ChromeStyle, type DeviceView } from './chrome-style.ts';
import { DeviceChrome } from './DeviceChrome.tsx';
import { CompareView } from './CompareStrip.tsx';
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
  extraNodeIds?: readonly string[] | undefined;
  onSelect: (screenId: string, nodeId?: string, additive?: boolean) => void;
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
  extraNodeIds,
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
  const linkDragRef = useRef<(drag: FrameDrag | undefined) => void>(undefined);
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

  // Screens picked recently keep their live preview, so switching between them never flashes the
  // structure view (§5.2 keeps the rest as structure).
  const [warm, setWarm] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!selectedScreenId) return;
    setWarm((previous) =>
      [selectedScreenId, ...previous.filter((id) => id !== selectedScreenId)].slice(
        0,
        WARM_SCREENS,
      ),
    );
  }, [selectedScreenId]);
  // A screen picked on the canvas is already in view: selecting never moves the camera.
  const pickedOnBoard = useRef(false);

  const comparing = useDevices((state) => state.comparing);
  const showFlow = usePreferences((state) => state.showFlow);
  const setShowFlow = usePreferences((state) => state.setShowFlow);
  const showFlowRef = useRef(showFlow);
  showFlowRef.current = showFlow;
  const [prototype, setPrototype] = useState(false);
  // Screens visited in the prototype, for Back; a missed click flashes the hotspots (as in Figma).
  const [history, setHistory] = useState<readonly string[]>([]);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef(0);
  const [focus, setFocus] = useState(false);
  const toggleFocus = () => {
    const next = !focus;
    setFocus(next);
    if (next && selectedScreenId) fitScreen(selectedScreenId);
    else fitAll();
  };
  const documentRef = useRef(document);
  documentRef.current = document;

  /** Shows one screen of the prototype, framed, remembering where it came from. */
  const showScreen = useCallback(
    (screenId: string, from?: string) => {
      if (from) setHistory((previous) => [...previous, from]);
      pickedOnBoard.current = true;
      onSelect(screenId);
      fitScreen(screenId);
    },
    [onSelect, fitScreen],
  );
  const startPrototype = () => {
    const start = selectedScreenId ?? document.board.initialScreenId ?? document.screens[0]?.id;
    setPrototype(true);
    setHistory([]);
    if (start) showScreen(start);
  };
  const stopPrototype = useCallback(() => {
    setPrototype(false);
    setHistory([]);
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
  }, []);
  // Presenting covers the whole window, so the camera re-frames once the new size is laid out.
  const presented = useRef(false);
  useLayoutEffect(() => {
    if (presented.current === prototype) return;
    presented.current = prototype;
    if (prototype) fitScreen(selectedRef.current);
    else if (focus) fitScreen(selectedRef.current);
    else fitAll();
  }, [prototype, focus, fitAll, fitScreen]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => {
      setFullscreen(window.document.fullscreenElement === rootRef.current);
      if (prototype) fitScreen(selectedRef.current);
    };
    window.document.addEventListener('fullscreenchange', onChange);
    return () => window.document.removeEventListener('fullscreenchange', onChange);
  }, [prototype, fitScreen]);
  const toggleFullscreen = () => {
    if (window.document.fullscreenElement) void window.document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  };
  const back = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    pickedOnBoard.current = true;
    onSelect(previous);
    fitScreen(previous);
  }, [history, onSelect, fitScreen]);

  // Prototype mode: a click on a trigger (or inside it) follows its navigation; any other click
  // shows where the triggers are instead of silently doing nothing.
  const selectInBoard = useCallback(
    (screenId: string, nodeId?: string, additive?: boolean) => {
      pickedOnBoard.current = true;
      if (!prototype) return onSelect(screenId, nodeId, additive);
      const current = documentRef.current;
      const source = current.screens.find((screen) => screen.id === screenId);
      const connection =
        source && nodeId ? findNavigation(source, current.connections, nodeId) : undefined;
      if (connection) return showScreen(connection.toScreenId, screenId);
      setFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 700);
    },
    [prototype, onSelect, showScreen],
  );

  // In the prototype, Esc leaves and ⌫ / ← go back. Captured before the editor shortcuts, so
  // Delete never removes a screen while presenting.
  useEffect(() => {
    if (!prototype) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (useDialogs.getState().open || isTyping(event.target)) return;
      if (event.key === 'Escape') stopPrototype();
      else if (['Backspace', 'Delete', 'ArrowLeft'].includes(event.key)) back();
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [prototype, stopPrototype, back]);

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
    if (pickedOnBoard.current) {
      pickedOnBoard.current = false;
      return;
    }
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

  // Wheel and trackpad, as in Figma: two fingers pan, pinch (ctrl/cmd + wheel) zooms at the cursor,
  // shift + wheel pans sideways. Non-passive, so the browser never zooms or scrolls the page.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      const dx = event.deltaX * unit;
      const dy = event.deltaY * unit;
      if (event.ctrlKey || event.metaKey) {
        // A pinch sends small deltas; one mouse-wheel notch (~100) is capped to a gentle step.
        const step = Math.max(-50, Math.min(50, dy));
        zoomAt(camera.current.zoom * Math.exp(-step * 0.01), event.clientX, event.clientY);
        return;
      }
      const sideways = event.shiftKey && dx === 0;
      camera.current = {
        ...camera.current,
        x: camera.current.x - (sideways ? dy : dx),
        y: camera.current.y - (sideways ? 0 : dy),
      };
      apply();
    };
    // Safari reports trackpad pinches as gesture events instead of ctrl + wheel.
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    let startZoom = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      startZoom = camera.current.zoom;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Gesture;
      zoomAt(startZoom * gesture.scale, gesture.clientX, gesture.clientY);
    };
    const stop = (event: Event) => event.preventDefault();
    // A pinch over the panels would zoom the whole page; the editor keeps it at 100 %.
    const onPageWheel = (event: WheelEvent) => {
      if ((event.ctrlKey || event.metaKey) && !viewport.contains(event.target as Node))
        event.preventDefault();
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('gesturestart', onGestureStart);
    viewport.addEventListener('gesturechange', onGestureChange);
    viewport.addEventListener('gestureend', stop);
    window.addEventListener('wheel', onPageWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
      viewport.removeEventListener('gestureend', stop);
      window.removeEventListener('wheel', onPageWheel);
    };
  }, [zoomAt, apply]);

  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | undefined>(
    undefined,
  );

  // Space held: the hand tool. Dragging pans even over a screen, and nothing gets selected.
  const spaceHeld = useRef(false);
  const onPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!spaceHeld.current || event.button !== 0) return;
    event.stopPropagation();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: true };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = 'grabbing';
  };

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
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    event.currentTarget.style.cursor = spaceHeld.current ? 'grab' : '';
  };

  // Camera keys work wherever focus is, except in a field or a dialog (as in Figma).
  const selectedScreenRef = useRef(selectedScreenId);
  selectedScreenRef.current = selectedScreenId;
  useEffect(() => {
    const viewport = viewportRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (useDialogs.getState().open || isTyping(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.code === 'Space' && !mod && onCanvas(event.target)) {
        event.preventDefault();
        if (!event.repeat && viewport) viewport.style.cursor = 'grab';
        spaceHeld.current = true;
        return;
      }
      if (mod && (event.key === '=' || event.key === '+')) zoomAt(camera.current.zoom * 1.25);
      else if (mod && event.key === '-') zoomAt(camera.current.zoom / 1.25);
      else if ((mod && event.key === '0') || (event.shiftKey && event.code === 'Digit0')) zoomAt(1);
      else if (event.shiftKey && !mod && event.code === 'KeyF')
        usePreferences.getState().setShowFlow(!showFlowRef.current);
      else if (event.shiftKey && !mod && event.code === 'Digit1') fitAll();
      else if (event.shiftKey && !mod && event.code === 'Digit2')
        fitScreen(selectedScreenRef.current);
      else return;
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceHeld.current = false;
      if (viewport && !drag.current) viewport.style.cursor = '';
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [zoomAt, fitAll, fitScreen]);

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
  const links = flowLinks(document);
  const outgoing = document.connections.filter(
    (connection) => connection.fromScreenId === selectedScreenId,
  );
  const hotspots = new Set(outgoing.flatMap((connection) => connection.triggerNodeId ?? []));
  // Navigations with no trigger (e.g. the Basic journey's) are offered as buttons in the bar.
  const untriggered = outgoing.filter((connection) => !connection.triggerNodeId);
  // The editor applies drops and text edits to the selected screen, so only that one takes them.
  const editing = (screenId: string) => !prototype && screenId === selectedScreenId;
  const getZoom = () => camera.current.zoom;

  return (
    <div
      ref={rootRef}
      className={cx(
        'overflow-hidden',
        // Presenting, as in Figma: the prototype alone over a dark stage, the editor hidden.
        // (`relative` and `fixed` can't share the class list: the later utility in the CSS wins.)
        prototype ? 'fixed inset-0 z-40 bg-[oklch(0.16_0_0)]' : 'relative h-full',
      )}
    >
      <div
        ref={viewportRef}
        role="region"
        aria-label={i18n.t('editor.board.label')}
        tabIndex={0}
        onPointerDownCapture={onPointerDownCapture}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-board
        data-tour="canvas"
        className={cx(
          'absolute touch-none overflow-hidden focus-visible:outline-none',
          // The stage leaves room for the bars, so the screen is framed between them.
          prototype ? 'inset-x-0 top-14 bottom-32' : 'inset-0 bg-canvas',
        )}
        style={
          prototype
            ? undefined
            : { backgroundImage: 'radial-gradient(circle, var(--line) 1px, transparent 1px)' }
        }
      >
        <div ref={worldRef} className="absolute top-0 left-0 origin-top-left will-change-transform">
          {focus || prototype ? null : (
            <FlowLinks
              links={links}
              frameById={frameById}
              size={size}
              selectedScreenId={selectedScreenId}
              showFlow={showFlow}
              simplified={simplified}
              dragRef={linkDragRef}
            />
          )}
          {frames.map(({ screen, x, y }) =>
            visible.has(screen.id) && (!(focus || prototype) || screen.id === selectedScreenId) ? (
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
                selected={!prototype && screen.id === selectedScreenId}
                presenting={prototype}
                hotspots={
                  (prototype || showFlow) && screen.id === selectedScreenId
                    ? { ids: hotspots, flash: prototype && flash }
                    : undefined
                }
                live={screen.id === selectedScreenId || warm.includes(screen.id)}
                selectedNodeId={screen.id === selectedScreenId ? selectedNodeId : undefined}
                extraNodeIds={screen.id === selectedScreenId ? extraNodeIds : undefined}
                onSelect={selectInBoard}
                onFocusScreen={fitScreen}
                onMove={prototype || !onMoveScreen ? undefined : moveScreen}
                onDrag={(drag) => linkDragRef.current?.(drag)}
                onInsertComponent={editing(screen.id) ? onInsertComponent : undefined}
                canInsertComponent={editing(screen.id) ? canInsertComponent : undefined}
                onEditText={editing(screen.id) ? onEditText : undefined}
                onSetSpacing={editing(screen.id) ? onSetSpacing : undefined}
                strings={document.strings}
                getZoom={getZoom}
              />
            ) : null,
          )}
        </div>
      </div>

      {prototype && (
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <div
            role="status"
            data-prototype-screen
            className="flex min-w-0 items-center gap-2 rounded-lg bg-panel px-3 py-1.5 text-xs shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]"
          >
            <Play size={13} aria-hidden className="shrink-0 text-accent-fg" />
            <span className="truncate font-semibold">{selectedScreen?.name}</span>
            <span className="tabular shrink-0 text-fg-muted">
              {i18n.t('editor.prototype.step', { n: String(history.length + 1) })}
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-panel p-0.5 shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]">
            <IconButton
              label={i18n.t(
                fullscreen ? 'editor.prototype.exitFullscreen' : 'editor.prototype.fullscreen',
              )}
              tooltipSide="bottom"
              icon={fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              onClick={toggleFullscreen}
            />
            <Button size="sm" variant="ghost" onClick={stopPrototype}>
              <X size={13} aria-hidden />
              {i18n.t('editor.prototype.exit')}
            </Button>
          </div>
        </div>
      )}

      <div
        data-tour="modes"
        className={cx(
          'pointer-events-none absolute top-3 left-3 flex items-center gap-2',
          prototype && 'hidden',
        )}
      >
        <Button
          size="sm"
          variant={prototype ? 'primary' : 'secondary'}
          aria-pressed={prototype}
          className="pointer-events-auto"
          onClick={prototype ? stopPrototype : startPrototype}
        >
          {prototype ? <Pencil size={13} aria-hidden /> : <Play size={13} aria-hidden />}
          {i18n.t(prototype ? 'editor.board.prototypeOff' : 'editor.board.prototypeOn')}
        </Button>
        {!prototype && (
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
        )}
        <Button
          size="sm"
          variant={showFlow ? 'primary' : 'secondary'}
          aria-pressed={showFlow}
          title={i18n.t('editor.board.flowHint')}
          className="pointer-events-auto"
          onClick={() => setShowFlow(!showFlow)}
        >
          <Workflow size={13} aria-hidden />
          {i18n.t('editor.board.flow')}
        </Button>
      </div>

      {prototype && (
        <div
          role="toolbar"
          aria-label={i18n.t('editor.prototype.label')}
          className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg bg-panel px-3 py-2 text-xs shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]"
        >
          <span className="text-fg-muted">
            {i18n.t(
              hotspots.size > 0
                ? 'editor.prototype.hintTriggers'
                : untriggered.length > 0
                  ? 'editor.prototype.hintButtons'
                  : 'editor.prototype.hintNone',
            )}
          </span>
          {untriggered.map((connection) => (
            <Button
              key={connection.id}
              size="sm"
              variant="primary"
              onClick={() =>
                selectedScreenId && showScreen(connection.toScreenId, selectedScreenId)
              }
            >
              <ArrowRight size={13} aria-hidden />
              {document.screens.find((screen) => screen.id === connection.toScreenId)?.name}
            </Button>
          ))}
          <Button size="sm" variant="secondary" disabled={history.length === 0} onClick={back}>
            <ArrowLeft size={13} aria-hidden />
            {i18n.t('editor.prototype.back')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const start = document.board.initialScreenId ?? document.screens[0]?.id;
              setHistory([]);
              if (start) showScreen(start);
            }}
          >
            <RotateCcw size={13} aria-hidden />
            {i18n.t('editor.prototype.restart')}
          </Button>
        </div>
      )}

      {selectedScreen && comparing && !prototype && (
        <CompareView
          screen={selectedScreen}
          previewTheme={previewTheme}
          stateId={stateId}
          strings={document.strings}
        />
      )}

      <div
        data-tour="zoom"
        className={cx(
          'absolute right-3 bottom-3 flex items-center gap-0.5 rounded-md bg-panel p-0.5 shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]',
          prototype && 'hidden',
        )}
      >
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
  /** In the prototype the frame is shown bare: no name label, nothing to grab. */
  presenting?: boolean;
  /** Rendered by the real preview: the selected screen and the last ones selected. */
  live: boolean;
  /** Prototype triggers to highlight; `flash` after a click that missed them. */
  hotspots?: { ids: ReadonlySet<string>; flash: boolean } | undefined;
  selectedNodeId: string | undefined;
  extraNodeIds?: readonly string[] | undefined;
  onSelect: (screenId: string, nodeId?: string, additive?: boolean) => void;
  onFocusScreen: (screenId: string) => void;
  onMove: ((screenId: string, position: { x: number; y: number }) => void) | undefined;
  /** The frame's live offset while its label is dragged; `undefined` when the drag ends. */
  onDrag: (drag: FrameDrag | undefined) => void;
  onInsertComponent: BoardProps['onInsertComponent'];
  canInsertComponent: BoardProps['canInsertComponent'];
  onEditText: BoardProps['onEditText'];
  onSetSpacing: BoardProps['onSetSpacing'];
  strings: Record<string, string>;
  getZoom: () => number;
}

const SNAP = 8;
/** Live previews kept around: the selected screen plus the last ones picked. */
const WARM_SCREENS = 4;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/**
 * One routing for every pair: the arrow leaves the side of `from` facing `to` and enters the
 * opposite side of `to`, a cubic curve whose handles point out of those sides. Which sides is
 * decided by the dominant direction (measured in frame sizes), so while a frame is dragged the
 * curve bends continuously and only swaps sides when the frames pass each other diagonally.
 */
function connectionPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: FrameSize,
): { d: string; mid: { x: number; y: number }; end: { x: number; y: number; angle: number } } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) / size.width >= Math.abs(dy) / size.height;
  let x1, y1, x2, y2, h1x, h1y, angle;
  if (horizontal) {
    const right = dx >= 0;
    x1 = right ? from.x + size.width : from.x;
    x2 = right ? to.x : to.x + size.width;
    y1 = from.y + size.height / 2;
    y2 = to.y + size.height / 2;
    const bend = Math.max(48, Math.abs(x2 - x1) / 2);
    h1x = right ? bend : -bend;
    h1y = 0;
    angle = right ? 0 : 180;
  } else {
    const down = dy >= 0;
    x1 = from.x + size.width / 2;
    x2 = to.x + size.width / 2;
    // The name label sits above each frame, so arrows on that side start or end above it.
    y1 = down ? from.y + size.height : from.y - LABEL_HEIGHT;
    y2 = down ? to.y - LABEL_HEIGHT : to.y + size.height;
    const bend = Math.max(48, Math.abs(y2 - y1) / 2);
    h1x = 0;
    h1y = down ? bend : -bend;
    angle = down ? 90 : -90;
  }
  const c1 = { x: x1 + h1x, y: y1 + h1y };
  const c2 = { x: x2 - h1x, y: y2 - h1y };
  return {
    d: `M${x1},${y1} C${c1.x},${c1.y} ${c2.x},${c2.y} ${x2},${y2}`,
    // The curve's own point at t = 0.5.
    mid: { x: (x1 + 3 * c1.x + 3 * c2.x + x2) / 8, y: (y1 + 3 * c1.y + 3 * c2.y + y2) / 8 },
    end: { x: x2, y: y2, angle },
  };
}

/** One arrow per pair of screens, with the names of every element that triggers it. */
function flowLinks(document: RnjbDocument) {
  const links = new Map<string, { from: string; to: string; triggers: string[] }>();
  for (const connection of document.connections) {
    if (connection.fromScreenId === connection.toScreenId) continue;
    const key = `${connection.fromScreenId}>${connection.toScreenId}`;
    const link = links.get(key) ?? {
      from: connection.fromScreenId,
      to: connection.toScreenId,
      triggers: [],
    };
    const screen = document.screens.find((candidate) => candidate.id === connection.fromScreenId);
    const node = connection.triggerNodeId ? screen?.nodes[connection.triggerNodeId] : undefined;
    const name =
      node && (node.name ?? (node.kind === 'component' ? node.ref.component : undefined));
    if (name && !link.triggers.includes(name)) link.triggers.push(name);
    links.set(key, link);
  }
  return [...links.entries()];
}

/** The arrows between frames. Owns the drag offset, so they follow a moving frame without re-rendering every frame. */
function FlowLinks({
  links,
  frameById,
  size,
  selectedScreenId,
  showFlow,
  simplified,
  dragRef,
}: {
  links: ReturnType<typeof flowLinks>;
  frameById: ReadonlyMap<string, { x: number; y: number }>;
  size: FrameSize;
  selectedScreenId: string | undefined;
  showFlow: boolean;
  simplified: boolean;
  dragRef: { current: ((drag: FrameDrag | undefined) => void) | undefined };
}) {
  const [drag, setDrag] = useState<FrameDrag>();
  useLayoutEffect(() => {
    dragRef.current = setDrag;
    return () => {
      dragRef.current = undefined;
    };
  }, [dragRef]);
  const at = (screenId: string) => {
    const frame = frameById.get(screenId);
    return frame && drag?.screenId === screenId
      ? { x: frame.x + drag.dx, y: frame.y + drag.dy }
      : frame;
  };
  return (
    <>
      <svg
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden
      >
        {links.map(([key, link]) => {
          const from = at(link.from);
          const to = at(link.to);
          if (!from || !to) return null;
          // With the flow layer on, the selected screen's arrows lead; the rest recede.
          const touches = link.from === selectedScreenId || link.to === selectedScreenId;
          return (
            <path
              key={key}
              d={connectionPath(from, to, size).d}
              fill="none"
              stroke={showFlow ? 'var(--selection-color)' : 'var(--fg-muted)'}
              strokeOpacity={touches || !selectedScreenId ? 1 : showFlow ? 0.4 : 0.6}
              strokeWidth={showFlow ? 3 : 2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {/* Arrowheads keep their on-screen size at any zoom, like the labels, so the direction reads. */}
      {links.map(([key, link]) => {
        const from = at(link.from);
        const to = at(link.to);
        if (!from || !to) return null;
        const { end } = connectionPath(from, to, size);
        const touches = link.from === selectedScreenId || link.to === selectedScreenId;
        return (
          <svg
            key={key}
            aria-hidden
            width={showFlow ? 18 : 14}
            height={showFlow ? 18 : 14}
            viewBox="0 0 10 10"
            className="pointer-events-none absolute overflow-visible"
            style={{
              left: end.x,
              top: end.y,
              opacity: touches || !selectedScreenId ? 1 : showFlow ? 0.4 : 0.6,
              transform: `translate(-100%, -50%) scale(var(--inv-zoom)) rotate(${end.angle}deg)`,
              transformOrigin: 'right center',
            }}
          >
            <path
              d="M0,0 L10,5 L0,10 L2.5,5 z"
              fill={showFlow ? 'var(--selection-color)' : 'var(--fg-muted)'}
            />
          </svg>
        );
      })}
      {showFlow && !simplified
        ? links.map(([key, link]) => {
            const from = at(link.from);
            const to = at(link.to);
            // Only triggers are labelled: an arrow alone already says "navigates to".
            if (!from || !to || link.triggers.length === 0) return null;
            const { mid } = connectionPath(from, to, size);
            const touches = link.from === selectedScreenId || link.to === selectedScreenId;
            return (
              <span
                key={key}
                className={cx(
                  'pointer-events-none absolute max-w-[200px] truncate rounded-full bg-panel px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow-[0_0_0_1px_var(--selection-color),0_1px_3px_oklch(0_0_0/0.12)]',
                  touches || !selectedScreenId ? 'text-accent-fg' : 'text-fg-muted opacity-70',
                )}
                style={{
                  left: mid.x,
                  top: mid.y,
                  // Above the line, so the label never hides a short arrow.
                  transform: 'translate(-50%, calc(-100% - 6px)) scale(var(--inv-zoom))',
                  transformOrigin: 'bottom center',
                }}
              >
                {link.triggers.join(', ')}
              </span>
            );
          })
        : null}
    </>
  );
}

interface FrameDrag {
  screenId: string;
  dx: number;
  dy: number;
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
  presenting,
  live,
  hotspots,
  selectedNodeId,
  extraNodeIds,
  onSelect,
  onFocusScreen,
  onMove,
  onDrag,
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
    onDrag({ screenId: screen.id, dx: state.dx, dy: state.dy });
  };
  const onLabelPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = move.current;
    if (state?.pointerId !== event.pointerId) return;
    move.current = undefined;
    if (rootRef.current) rootRef.current.style.transform = '';
    if (state.dx !== 0 || state.dy !== 0) onMove?.(screen.id, { x: x + state.dx, y: y + state.dy });
    // Same event as the move, so React paints the arrows at the new position in one go.
    onDrag(undefined);
  };

  // Frames without a live preview (zoomed out, not recently picked, or still loading) show only
  // a neutral card: a component tree here read as if the screen were made of a bare "View".
  const placeholder = (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-fg-subtle">
      <span className="tabular text-[calc(12px*var(--inv-zoom))] leading-[1.3] whitespace-nowrap">
        {i18n.t('editor.board.structure', { count: nodeCount })}
      </span>
    </div>
  );

  return (
    <div ref={rootRef} className="absolute" style={{ left: x, top: y, width: size.width }}>
      {!presenting && (
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
      )}
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
        {simplified || !live ? (
          placeholder
        ) : (
          <PreviewFrame
            screen={screen}
            hotspots={hotspots}
            size={size}
            insets={{ top: view?.insets.top ?? 0, bottom: view?.insets.bottom ?? 0 }}
            theme={previewTheme}
            stateId={stateId}
            selectedNodeId={selectedNodeId}
            extraNodeIds={extraNodeIds}
            onSelectNode={(nodeId, additive) => onSelect(screen.id, nodeId, additive)}
            onInsertComponent={onInsertComponent}
            canInsertComponent={canInsertComponent}
            strings={strings}
            onEditText={onEditText}
            onSetSpacing={onSetSpacing}
            fold={view?.separating ? view.hinge : undefined}
            fallback={placeholder}
          />
        )}
      </div>
    </div>
  );
}

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
