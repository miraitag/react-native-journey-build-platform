import { useEffect, useState } from 'react';
import type { Screen } from '@rnjb/core';
import { useT } from '../app/preferences.ts';
import { osVersionOf, useDevices } from '../services/device-store.ts';
import { DeviceChrome } from './DeviceChrome.tsx';
import { deviceView, pickChromeStyle } from './chrome-style.ts';
import { PreviewFrame } from './PreviewFrame.tsx';

/** Compared devices update this long after the last edit; only the main one is live (§12.6). */
const COMPARE_DELAY_MS = 300;
const STRIP_HEIGHT = 360;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** The selected screen on up to two more devices, scaled to fit, read-only. */
export function CompareStrip({
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
  const compareIds = useDevices((state) => state.compareIds);
  const devices = useDevices((state) => state.devices);
  const orientation = useDevices((state) => state.orientation);
  const postures = useDevices((state) => state.postures);
  const osVersions = useDevices((state) => state.osVersions);
  const chromeStyles = useDevices((state) => state.chromeStyles);
  const settled = useDebounced(screen, COMPARE_DELAY_MS);
  const compared = compareIds.flatMap((id) => devices.filter((device) => device.id === id));
  if (compared.length === 0) return null;

  return (
    <section
      aria-label={i18n.t('editor.compare.region')}
      className="absolute top-12 right-3 flex gap-3 rounded-lg bg-panel p-3 shadow-[0_0_0_1px_var(--line-subtle),var(--shadow-popover)]"
    >
      {compared.map((device) => {
        const view = deviceView(device, orientation, postures[device.id]);
        const scale = Math.min(1, STRIP_HEIGHT / view.height);
        const style = pickChromeStyle(chromeStyles, device, osVersionOf(device, osVersions));
        return (
          <figure key={device.id} className="flex flex-col gap-1.5">
            <figcaption className="text-xs text-fg-muted">{device.name}</figcaption>
            <div style={{ width: view.width * scale, height: view.height * scale }}>
              <div
                className="relative origin-top-left overflow-hidden bg-panel shadow-[0_0_0_1px_var(--line)]"
                style={{
                  width: view.width,
                  height: view.height,
                  borderRadius: device.cornerRadius,
                  transform: `scale(${scale})`,
                }}
              >
                <DeviceChrome device={device} view={view} style={style} />
                <PreviewFrame
                  screen={settled}
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
    </section>
  );
}
