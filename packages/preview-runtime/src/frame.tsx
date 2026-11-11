import { Component, createElement, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as ReactNativeWeb from 'react-native-web';
import { AppRegistry, Text, View } from 'react-native-web';
import { installHostRuntime, loadBundle } from './host-runtime.ts';
import {
  frameMessageSchema,
  hostMessageSchema,
  type FrameMessage,
  type HostMessage,
  type NodeRect,
  type Scene,
} from './protocol.ts';

type RenderMessage = Extract<HostMessage, { type: 'rnjb:render' }>;
type Libraries = ReadonlyMap<string, Record<string, unknown>>;

const post = (message: FrameMessage) =>
  window.parent.postMessage(frameMessageSchema.parse(message), '*');

/** A library component that throws falls back to the placeholder instead of blanking the screen. */
class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const isRenderable = (value: unknown): value is Parameters<typeof createElement>[0] =>
  typeof value === 'function' || (typeof value === 'object' && value !== null);

const palette = {
  light: { bg: '#ffffff', fg: '#1b1b1f', muted: '#6b6b76', line: '#c9c9d1', fill: '#f3f3f6' },
  dark: { bg: '#16161a', fg: '#ececf1', muted: '#9d9da8', line: '#3a3a44', fill: '#202026' },
} as const;

function PreviewNode({
  scene,
  id,
  colors,
  libraries,
  depth,
}: {
  scene: Scene;
  id: string;
  colors: (typeof palette)[keyof typeof palette];
  libraries: Libraries;
  depth: number;
}) {
  const node = scene.nodes[id];
  if (!node || depth > 64) return null;
  const children = node.children.map((child) => (
    <PreviewNode
      key={child}
      scene={scene}
      id={child}
      colors={colors}
      libraries={libraries}
      depth={depth + 1}
    />
  ));
  // Text-like props are shown so the screen reads like the real one; nothing is evaluated.
  const shown = Object.entries(node.props)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .slice(0, 2)
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join(' · ');
  const placeholder = (
    <View
      style={{
        borderWidth: 1,
        borderStyle: node.kind === 'code' ? 'dashed' : 'solid',
        borderColor: colors.line,
        borderRadius: 6,
        backgroundColor: colors.fill,
        padding: 6,
        gap: 4,
      }}
    >
      <Text style={{ color: colors.fg, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
        {node.label}
      </Text>
      {shown && <Text style={{ color: colors.muted, fontSize: 11 }}>{shown}</Text>}
      {children}
    </View>
  );
  const real = node.ref ? libraries.get(node.ref.package)?.[node.ref.component] : undefined;
  return (
    <View dataSet={{ nodeId: id }} style={node.style}>
      {isRenderable(real) ? (
        <Guard fallback={placeholder}>{createElement(real, node.props, ...children)}</Guard>
      ) : (
        placeholder
      )}
    </View>
  );
}

function collectRects(root: HTMLElement): Record<string, NodeRect> {
  const origin = root.getBoundingClientRect();
  const rects: Record<string, NodeRect> = {};
  for (const element of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
    const id = element.dataset['nodeId'];
    if (!id) continue;
    const box = element.getBoundingClientRect();
    rects[id] = { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height };
  }
  return rects;
}

/**
 * `react-native` is already here as react-native-web: its primitives render without a bundle
 * (its own sources are Flow for native and cannot be compiled for the web).
 */
const BUILT_IN: Libraries = new Map([
  ['react-native', ReactNativeWeb as unknown as Record<string, unknown>],
]);

/** Whether something under `target` can still scroll in the wheel's direction. */
function canScroll(target: EventTarget | null, deltaX: number, deltaY: number): boolean {
  for (
    let element = target instanceof Element ? target : null;
    element;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    const y = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const x = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
    if (y && deltaY > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1)
      return true;
    if (y && deltaY < 0 && element.scrollTop > 0) return true;
    if (x && deltaX > 0 && element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
      return true;
    if (x && deltaX < 0 && element.scrollLeft > 0) return true;
  }
  return false;
}

/**
 * The editor pans and zooms its canvas with the wheel and the trackpad. Over the screen the
 * frame keeps the wheel only while its own content scrolls (§11.8); a pinch always goes out.
 */
function forwardWheel(event: WheelEvent) {
  const zoom = event.ctrlKey || event.metaKey;
  if (!zoom && canScroll(event.target, event.deltaX, event.deltaY)) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  post({
    type: 'rnjb:wheel',
    deltaX: event.deltaX * unit,
    deltaY: event.deltaY * unit,
    zoom,
    x: event.clientX,
    y: event.clientY,
  });
}

// Safari reports a trackpad pinch as gesture events, not ctrl + wheel: each change goes out as the
// wheel delta that zooms the canvas by the same ratio (the canvas zooms by exp(-deltaY / 100)).
let gestureScale = 1;
function forwardGesture(event: Event) {
  event.preventDefault();
  const gesture = event as Event & { scale: number; clientX: number; clientY: number };
  if (event.type === 'gesturechange' && gesture.scale > 0) {
    post({
      type: 'rnjb:wheel',
      deltaX: 0,
      deltaY: -Math.log(gesture.scale / gestureScale) * 100,
      zoom: true,
      x: gesture.clientX,
      y: gesture.clientY,
    });
  }
  gestureScale = event.type === 'gesturechange' ? gesture.scale : 1;
}
const GESTURES = ['gesturestart', 'gesturechange', 'gestureend'];

function Frame() {
  const [state, setState] = useState<RenderMessage | undefined>();
  const [libraries, setLibraries] = useState<Libraries>(BUILT_IN);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    window.addEventListener('wheel', forwardWheel, { passive: false });
    for (const type of GESTURES) window.addEventListener(type, forwardGesture);
    return () => {
      window.removeEventListener('wheel', forwardWheel);
      for (const type of GESTURES) window.removeEventListener(type, forwardGesture);
    };
  }, []);

  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const parsed = hostMessageSchema.safeParse(event.data);
      if (!parsed.success) {
        post({ type: 'rnjb:error', message: 'Invalid message from the editor' });
        return;
      }
      const message = parsed.data;
      if (message.type === 'rnjb:render') {
        setState(message);
        return;
      }
      try {
        const exported = loadBundle(message.globalName, message.code);
        setLibraries((previous) => new Map(previous).set(message.package, exported));
        post({ type: 'rnjb:library-loaded', key: message.key });
      } catch (error) {
        // A missing shim lands here: the library's components stay placeholders.
        post({
          type: 'rnjb:library-failed',
          key: message.key,
          message: error instanceof Error ? error.message : 'load failed',
        });
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'rnjb:ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useLayoutEffect(() => {
    if (state && rootRef.current) {
      post({
        type: 'rnjb:rects',
        screenId: state.scene.screenId,
        rects: collectRects(rootRef.current),
      });
    }
  }, [state, libraries]);

  if (!state) return null;
  const colors = palette[state.theme];
  return (
    <div
      ref={rootRef}
      style={{
        width: state.size.width,
        height: state.size.height,
        background: colors.bg,
        overflow: 'hidden',
      }}
    >
      <PreviewNode
        scene={state.scene}
        id={state.scene.rootId}
        colors={colors}
        libraries={libraries}
        depth={0}
      />
    </div>
  );
}

/** Entry point of the preview page: mounts the frame and starts listening to the editor. */
export function mountFrame(container: HTMLElement): void {
  document.documentElement.style.margin = '0';
  document.body.style.margin = '0';
  installHostRuntime();
  AppRegistry.registerComponent('RnjbPreview', () => Frame);
  AppRegistry.runApplication('RnjbPreview', { rootTag: container });
}
