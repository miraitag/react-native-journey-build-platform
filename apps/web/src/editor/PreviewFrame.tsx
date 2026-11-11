import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Screen, SpacingTarget } from '@rnjb/core';
import {
  buildScene,
  frameMessageSchema,
  type HostMessage,
  type NodeRect,
} from '@rnjb/preview-runtime';
import { Badge, cx } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { localService } from '../services/local-service.ts';
import { useService } from '../services/service-store.ts';
import { useLibraries } from '../services/library-store.ts';
import type { FrameSize } from './board-geometry.ts';
import { crossingFold, type DeviceView } from './chrome-style.ts';
import { useCatalogDrag } from './catalog-drag.ts';
import type { DraggedComponent } from './insert-component.ts';
import { SpacingOverlay } from './SpacingOverlay.tsx';
import { textPropOf } from './text-edit.ts';

interface PreviewFrameProps {
  screen: Screen;
  size: FrameSize;
  /** Safe-area insets of the active device: the screen content lives between them. */
  insets: { top: number; bottom: number };
  theme: 'light' | 'dark';
  stateId: string | undefined;
  selectedNodeId: string | undefined;
  extraNodeIds?: readonly string[] | undefined;
  /** Prototype triggers, outlined; filled while `flash` (a click missed them). */
  hotspots?: { ids: ReadonlySet<string>; flash: boolean } | undefined;
  onSelectNode: (nodeId: string, additive?: boolean) => void;
  onInsertComponent: ((item: DraggedComponent, targetNodeId?: string) => void) | undefined;
  canInsertComponent: ((item: DraggedComponent, targetNodeId?: string) => boolean) | undefined;
  /** Document texts, shown in the preview. */
  strings: Record<string, string>;
  /** Commits text typed on the canvas (double click); absent when the document is read-only. */
  onEditText: ((nodeId: string, prop: string, text: string) => void) | undefined;
  /** Commits a spacing value dragged on the canvas; absent when the document is read-only. */
  onSetSpacing:
    ((nodeId: string, target: SpacingTarget, value: number | undefined) => void) | undefined;
  /** The fold of a half-opened foldable, in frame coordinates; content across it is flagged. */
  fold: DeviceView['hinge'];
  /** Shown while the preview is not available or if it fails (structural view). */
  fallback: ReactNode;
}

/**
 * Live preview of one screen in a sandboxed iframe (ADR 0005). The iframe has an opaque origin
 * (no `allow-same-origin`), so every message is validated on both sides. Selection and hit areas
 * are drawn here, over the iframe, from the geometry the frame reports.
 */
export function PreviewFrame({
  screen,
  size,
  insets,
  theme,
  stateId,
  selectedNodeId,
  extraNodeIds,
  hotspots,
  onSelectNode,
  onInsertComponent,
  canInsertComponent,
  strings,
  onEditText,
  onSetSpacing,
  fold,
  fallback,
}: PreviewFrameProps) {
  const i18n = useT();
  const dragged = useCatalogDrag((state) => state.dragged);
  const endDrag = useCatalogDrag((state) => state.end);
  const [hover, setHover] = useState<{ id: string | undefined; valid: boolean }>();
  const [editing, setEditing] = useState<{ nodeId: string; prop: string; text: string }>();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const libraryPacks = useLibraries((state) => state.packs);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reported, setReported] = useState<
    { screenId: string; rects: Record<string, NodeRect> } | undefined
  >();

  const codeLabel = i18n.t('editor.layers.code');
  const sample = screen.states.find((state) => state.id === stateId)?.sample;
  const scene = useMemo(
    () => buildScene(screen, { ...(sample ? { sample } : {}), strings, codeLabel }),
    [screen, sample, strings, codeLabel],
  );
  const height = Math.max(1, size.height - insets.top - insets.bottom);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const parsed = frameMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === 'rnjb:wheel') {
        // Replayed on the iframe element, so it bubbles to the canvas like any other wheel.
        const iframe = frameRef.current;
        if (!iframe) return;
        const rect = iframe.getBoundingClientRect();
        const scale = iframe.offsetWidth > 0 ? rect.width / iframe.offsetWidth : 1;
        iframe.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: message.deltaX,
            deltaY: message.deltaY,
            ctrlKey: message.zoom,
            clientX: rect.left + message.x * scale,
            clientY: rect.top + message.y * scale,
            bubbles: true,
            cancelable: true,
          }),
        );
      } else if (message.type === 'rnjb:ready') setReady(true);
      else if (message.type === 'rnjb:error') setFailed(true);
      else if (message.type === 'rnjb:rects') {
        setReported({ screenId: message.screenId, rects: message.rects });
      }
      // 'rnjb:library-failed': the library's components stay placeholders ("approximate view").
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Compile-and-send each library the screen uses once; the service caches bundles by version+hash.
  const sources = useService((state) => state.settings?.librarySources);
  const packages = useMemo(
    () =>
      [
        ...new Set(
          Object.values(scene.nodes).flatMap((node) => (node.ref ? [node.ref.package] : [])),
        ),
      ].sort(),
    [scene],
  );
  const requested = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    for (const pkg of packages) {
      // `react-native` renders through react-native-web inside the frame; it has no bundle.
      if (pkg === 'react-native' || requested.current.has(pkg) || !sources?.[pkg]) continue;
      requested.current.add(pkg);
      localService
        .libraryBundle(pkg)
        .then((bundle) => {
          const message: HostMessage = {
            type: 'rnjb:library',
            package: pkg,
            key: bundle.key,
            globalName: bundle.globalName,
            code: bundle.code,
          };
          frameRef.current?.contentWindow?.postMessage(message, '*');
        })
        // A failed bundle is not retried on every edit; its components stay as markers.
        .catch(() => undefined);
    }
  }, [ready, packages, sources]);

  useEffect(() => {
    if (!ready) return;
    const message: HostMessage = {
      type: 'rnjb:render',
      scene,
      size: { width: size.width, height },
      theme,
    };
    // An opaque origin cannot be named as target; the scene holds no secrets.
    frameRef.current?.contentWindow?.postMessage(message, '*');
  }, [ready, scene, size.width, height, theme]);

  if (failed) return <>{fallback}</>;

  const rects = reported?.screenId === screen.id ? reported.rects : undefined;
  // Only leaves: a container spanning both segments is the normal layout, a text cut in two is not.
  const split = new Set(
    rects && fold
      ? crossingFold(
          rects,
          Object.keys(scene.nodes).filter(
            (id) => id !== screen.rootId && !screen.nodes[id]?.children.length,
          ),
          { ...fold, y: fold.y - insets.top },
        )
      : [],
  );
  const dropping = dragged !== undefined && onInsertComponent !== undefined;
  const selectedNode = selectedNodeId ? screen.nodes[selectedNodeId] : undefined;
  const spacingNode = selectedNode?.kind === 'component' ? selectedNode : undefined;
  const spacingScale = spacingNode
    ? libraryPacks.find((pack) => pack.package === spacingNode.ref.package)?.tokens?.spacing
    : undefined;

  /** Drag handlers for a node (or, with `id` undefined, the empty area = the screen root). */
  const dropProps = (id: string | undefined) =>
    dropping
      ? {
          onDragOver: (event: DragEvent<HTMLElement>) => {
            event.stopPropagation();
            const valid = canInsertComponent?.(dragged, id) ?? false;
            // Without preventDefault the browser shows the forbidden cursor and refuses the drop.
            if (valid) event.preventDefault();
            event.dataTransfer.dropEffect = valid ? 'copy' : 'none';
            setHover((current) =>
              current && current.id === id && current.valid === valid ? current : { id, valid },
            );
          },
          onDragLeave: () => setHover(undefined),
          onDrop: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            setHover(undefined);
            endDrag();
            onInsertComponent(dragged, id);
          },
        }
      : {};
  return (
    <div className="relative h-full">
      <iframe
        ref={frameRef}
        title={i18n.t('editor.board.livePreview', { screen: screen.name })}
        src="/preview.html"
        sandbox="allow-scripts"
        width={size.width}
        height={height}
        className="pointer-events-none absolute left-0 block border-0"
        style={{ top: insets.top }}
      />
      {rects && (
        <div
          className="absolute left-0"
          style={{ top: insets.top, width: size.width, height }}
          {...dropProps(undefined)}
        >
          {Object.keys(scene.nodes).map((id) => {
            const rect = rects[id];
            if (!rect) return null;
            return (
              <button
                key={id}
                type="button"
                tabIndex={-1}
                aria-label={scene.nodes[id]?.label}
                title={split.has(id) ? i18n.t('editor.board.acrossFold') : undefined}
                {...dropProps(id)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(id, event.shiftKey);
                }}
                onDoubleClick={(event) => {
                  const target = onEditText ? textPropOf(screen.nodes[id], strings) : undefined;
                  if (!target) return;
                  event.stopPropagation();
                  onSelectNode(id);
                  setEditing({ nodeId: id, prop: target.name, text: target.text });
                }}
                className={cx(
                  'absolute cursor-default bg-transparent',
                  dropping && hover?.id === id
                    ? hover.valid
                      ? 'shadow-[0_0_0_calc(2px*var(--inv-zoom))_var(--selection-color)]'
                      : 'shadow-[0_0_0_calc(2px*var(--inv-zoom))_var(--drop-invalid)]'
                    : id === selectedNodeId || extraNodeIds?.includes(id)
                      ? 'shadow-[0_0_0_calc(var(--selection-width)*var(--inv-zoom))_var(--selection-color)]'
                      : hotspots?.ids.has(id)
                        ? hotspots.flash
                          ? 'bg-[color-mix(in_oklch,var(--selection-color)_30%,transparent)] shadow-[0_0_0_calc(2px*var(--inv-zoom))_var(--selection-color)]'
                          : // Dashed, so a trigger never reads as the selection.
                            'outline-dashed outline-(--selection-color) [outline-offset:calc(1px*var(--inv-zoom))] [outline-width:calc(1.5px*var(--inv-zoom))]'
                        : split.has(id)
                          ? 'shadow-[0_0_0_calc(2px*var(--inv-zoom))_var(--warning)]'
                          : 'hover:shadow-[0_0_0_calc(1px*var(--inv-zoom))_var(--selection-color)]',
                )}
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              />
            );
          })}
          {spacingNode && onSetSpacing && !dropping && !editing && (
            <SpacingOverlay
              node={spacingNode}
              rects={rects}
              size={{ width: size.width, height }}
              scale={spacingScale}
              onSetSpacing={onSetSpacing}
            />
          )}
          {editing && onEditText && rects[editing.nodeId] && (
            <input
              autoFocus
              aria-label={i18n.t('editor.board.editText')}
              defaultValue={editing.text}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => {
                const text = event.target.value;
                setEditing(undefined);
                if (text !== editing.text) onEditText(editing.nodeId, editing.prop, text);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  event.currentTarget.value = editing.text;
                  event.currentTarget.blur();
                }
              }}
              className="absolute rounded-sm border-0 bg-panel px-1 text-fg outline-none shadow-[0_0_0_calc(2px*var(--inv-zoom))_var(--selection-color)]"
              style={{
                left: rects[editing.nodeId]?.x,
                top: rects[editing.nodeId]?.y,
                minWidth: Math.max(40, rects[editing.nodeId]?.width ?? 0),
                height: Math.max(20, rects[editing.nodeId]?.height ?? 0),
              }}
            />
          )}
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex origin-bottom-left scale-(--inv-zoom) gap-1">
        <Badge>{i18n.t('editor.board.approxView')}</Badge>
        {split.size > 0 && (
          <Badge tone="warning">{i18n.t('editor.board.splitByFold', { count: split.size })}</Badge>
        )}
      </div>
    </div>
  );
}
