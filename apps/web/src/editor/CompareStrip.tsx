import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Screen } from '@rnjb/core';
import type { Device } from '@rnjb/pack-schema';
import { Badge, Button, IconButton, Select } from '@rnjb/ui';
import { useDialogs } from '../app/dialogs-store.ts';
import { useT } from '../app/preferences.ts';
import { MAX_COMPARED, osVersionOf, useDevices } from '../services/device-store.ts';
import { DeviceChrome } from './DeviceChrome.tsx';
import { deviceView, pickChromeStyle } from './chrome-style.ts';
import { PreviewFrame } from './PreviewFrame.tsx';

/** Compared devices update this long after the last edit; only the main one is live (§12.6). */
const COMPARE_DELAY_MS = 300;
const GAP = 32;
/** Room for the caption above each device. */
const CAPTION = 40;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * Compare devices (§12.6): the selected screen on the main device and up to two more, side by
 * side and scaled to fit, to check how one layout adapts to sizes and platforms. It replaces the
 * canvas while on; Esc or Close returns to it.
 */
export function CompareView({
  screen,
  previewTheme,
  stateId,
  strings,
}: {
  screen: Screen;
  previewTheme: 'light' | 'dark';
  stateId: string | undefined;
  strings: Record<string, string>;
}) {
  const i18n = useT();
  const devices = useDevices((state) => state.devices);
  const selectedId = useDevices((state) => state.selectedId);
  const compareIds = useDevices((state) => state.compareIds);
  const setCompare = useDevices((state) => state.setCompare);
  const setComparing = useDevices((state) => state.setComparing);
  const orientation = useDevices((state) => state.orientation);
  const postures = useDevices((state) => state.postures);
  const osVersions = useDevices((state) => state.osVersions);
  const chromeStyles = useDevices((state) => state.chromeStyles);
  const settled = useDebounced(screen, COMPARE_DELAY_MS);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const measure = () => setArea({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || useDialogs.getState().open) return;
      event.preventDefault();
      event.stopPropagation();
      setComparing(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [setComparing]);

  const main = devices.find((device) => device.id === selectedId);
  const compared = compareIds.flatMap((id) => devices.filter((device) => device.id === id));
  const shown = [...(main ? [main] : []), ...compared].map((device) => ({
    device,
    view: deviceView(device, orientation, postures[device.id]),
  }));
  // One scale for all, so sizes stay comparable between devices.
  const totalWidth = shown.reduce((sum, { view }) => sum + view.width, 0);
  const tallest = Math.max(1, ...shown.map(({ view }) => view.height));
  const scale = Math.min(
    1,
    (area.width - GAP * (shown.length + 1)) / Math.max(1, totalWidth),
    (area.height - CAPTION - GAP) / tallest,
  );
  const addable = devices.filter(
    (device) => device.id !== selectedId && !compareIds.includes(device.id),
  );

  const caption = (device: Device, width: number, height: number) =>
    `${Math.round(width)} × ${Math.round(height)} · ${device.platform === 'ios' ? 'iOS' : 'Android'} ${osVersionOf(device, osVersions)}`;

  return (
    <section
      aria-label={i18n.t('editor.compare.region')}
      className="absolute inset-0 z-10 flex flex-col bg-canvas"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line-subtle bg-panel px-3 py-2">
        <h2 className="mr-2 text-sm font-semibold">
          {i18n.t('editor.compare.title', { name: screen.name })}
        </h2>
        {main && <Badge tone="accent">{main.name}</Badge>}
        {compared.map((device) => (
          <span
            key={device.id}
            className="inline-flex items-center gap-1 rounded-md bg-hover py-0.5 pr-0.5 pl-2 text-xs"
          >
            {device.name}
            <IconButton
              size="sm"
              label={i18n.t('editor.compare.remove', { name: device.name })}
              icon={<X size={12} />}
              onClick={() => setCompare(compareIds.filter((id) => id !== device.id))}
            />
          </span>
        ))}
        {compareIds.length < MAX_COMPARED && addable.length > 0 && (
          <Select
            aria-label={i18n.t('editor.compare.add')}
            className="w-[180px]"
            value=""
            onChange={(event) =>
              event.target.value && setCompare([...compareIds, event.target.value])
            }
          >
            <option value="">{i18n.t('editor.compare.add')}</option>
            {addable.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </Select>
        )}
        <span className="ml-auto text-xs text-fg-muted">{i18n.t('editor.compare.hint')}</span>
        <Button size="sm" variant="secondary" onClick={() => setComparing(false)}>
          {i18n.t('editor.compare.close')}
        </Button>
      </header>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto"
        style={{ gap: GAP, padding: GAP / 2 }}
      >
        {scale > 0 &&
          shown.map(({ device, view }, index) => {
            const style = pickChromeStyle(chromeStyles, device, osVersionOf(device, osVersions));
            return (
              <figure key={device.id} className="flex shrink-0 flex-col items-center gap-2">
                <figcaption className="flex flex-col items-center text-xs leading-tight">
                  <span className="font-medium">{device.name}</span>
                  <span className="tabular text-fg-muted">
                    {caption(device, view.width, view.height)}
                  </span>
                </figcaption>
                <div style={{ width: view.width * scale, height: view.height * scale }}>
                  <div
                    className="relative origin-top-left overflow-hidden bg-panel shadow-[0_0_0_1px_var(--line),var(--shadow-frame)]"
                    style={{
                      width: view.width,
                      height: view.height,
                      borderRadius: device.cornerRadius,
                      transform: `scale(${scale})`,
                    }}
                  >
                    <DeviceChrome device={device} view={view} style={style} />
                    <PreviewFrame
                      screen={index === 0 ? screen : settled}
                      size={{ width: view.width, height: view.height }}
                      insets={{ top: view.insets.top, bottom: view.insets.bottom }}
                      theme={previewTheme}
                      stateId={stateId}
                      selectedNodeId={undefined}
                      onSelectNode={() => undefined}
                      onInsertComponent={undefined}
                      canInsertComponent={undefined}
                      strings={strings}
                      onEditText={undefined}
                      onSetSpacing={undefined}
                      fold={view.separating ? view.hinge : undefined}
                      fallback={null}
                    />
                  </div>
                </div>
              </figure>
            );
          })}
      </div>
    </section>
  );
}
