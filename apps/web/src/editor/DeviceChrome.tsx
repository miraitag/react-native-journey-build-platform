import type { Device } from '@rnjb/pack-schema';
import { cx } from '@rnjb/ui';
import { cutoutsOf, type ChromeStyle, type DeviceView } from './chrome-style.ts';

/**
 * System chrome measured from the devices pack (§12): the status bar band, the cutouts, the bottom
 * indicator and a foldable's hinge, at the real logical size. It sits over the preview, so a style
 * with `backdropFilter` (Liquid Glass) blurs the real content behind it. Decorative.
 */
export function DeviceChrome({
  device,
  view,
  style,
}: {
  device: Device;
  view: DeviceView;
  style: ChromeStyle | undefined;
}) {
  // Colours come from the style's tokens; without a style for this OS version nothing is invented.
  const token = (name: string) => {
    const value = style?.tokens[name];
    return value === undefined ? undefined : String(value);
  };
  const statusBar = token('statusBarBackground');
  const indicator = token('indicatorColor');
  const blur = token('backdropFilter');
  const glass = blur ? { backdropFilter: blur, WebkitBackdropFilter: blur } : {};
  const portrait = view.height >= view.width;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {view.insets.top > 0 && (
        <div
          className={cx('absolute inset-x-0 top-0', statusBar === undefined && 'bg-fg/5')}
          style={{
            height: Math.min(device.statusBarHeight, view.insets.top),
            ...(statusBar === undefined ? {} : { background: statusBar }),
            ...glass,
          }}
        />
      )}
      {cutoutsOf(device, view).map((cutout) => (
        <div
          key={`${cutout.kind}-${cutout.x}-${cutout.y}`}
          data-testid="device-cutout"
          className="absolute"
          style={{
            // Hardware is black in any theme; the token palette has no plain black.
            background: '#000',
            left: cutout.x,
            top: cutout.y,
            width: cutout.width,
            height: cutout.height,
            // The notch hangs from the screen edge: rounded on the side facing the content.
            borderRadius:
              cutout.kind !== 'notch' ? 9999 : portrait ? '0 0 16px 16px' : '0 16px 16px 0',
          }}
        />
      ))}
      {view.hinge && (
        <div
          data-testid="device-hinge"
          className="absolute bg-fg/25"
          style={{
            left: view.hinge.x,
            top: view.hinge.y,
            // A flexible screen folds without hiding pixels: still draw the crease.
            width: Math.max(1, view.hinge.width),
            height: Math.max(1, view.hinge.height),
          }}
        />
      )}
      {device.bottomChrome !== 'three-button' && view.insets.bottom > 0 && (
        <div
          className={cx(
            'absolute left-1/2 -translate-x-1/2 rounded-full',
            indicator === undefined && 'bg-fg/40',
          )}
          style={{
            bottom: Math.min(8, view.insets.bottom / 2),
            width: device.bottomChrome === 'home-indicator' ? 134 : 108,
            height: 5,
            ...(indicator === undefined ? {} : { background: indicator }),
          }}
        />
      )}
    </div>
  );
}
