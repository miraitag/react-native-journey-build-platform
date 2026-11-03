import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { Device } from '@rnjb/pack-schema';
import { Button, Dialog, DialogContent, Field, IconButton, Input, Select } from '@rnjb/ui';
import { useDialogs } from '../app/dialogs-store.ts';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { useDevices } from '../services/device-store.ts';

type Platform = Device['platform'];

/** Defaults for what the form does not ask: a plain rectangle with the platform's usual chrome. */
const customDevice = (
  name: string,
  platform: Platform,
  width: number,
  height: number,
  density: number,
): Device => {
  const ios = platform === 'ios';
  const version = ios ? '26' : '16';
  const top = ios ? 47 : 24;
  const bottom = ios ? 34 : 24;
  return {
    id: `custom-${Date.now().toString(36)}`,
    name,
    platform,
    osVersions: [version],
    defaultOsVersion: version,
    logicalSize: { width, height },
    density,
    cornerRadius: 0,
    cutouts: [],
    safeArea: {
      portrait: { top, right: 0, bottom, left: 0 },
      landscape: { top: 0, right: 0, bottom, left: 0 },
    },
    statusBarHeight: top,
    bottomChrome: ios ? 'home-indicator' : 'gesture-bar',
  };
};

/** Create and remove the user's own devices, like the Android Studio device manager. */
export function CustomDevicesDialog() {
  const open = useDialogs((state) => state.open === 'devices');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={i18n.t('devices.title')}
          description={i18n.t('devices.description')}
          closeLabel={i18n.t('common.close')}
          width={480}
        >
          <Body />
        </DialogContent>
      )}
    </Dialog>
  );
}

function Body() {
  const i18n = useT();
  const custom = useDevices((state) => state.custom);
  const saveCustom = useDevices((state) => state.saveCustom);
  const select = useDevices((state) => state.select);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('android');
  const [width, setWidth] = useState('412');
  const [height, setHeight] = useState('915');
  const [density, setDensity] = useState('2.625');

  const w = Number(width);
  const h = Number(height);
  const d = Number(density);
  const valid = name.trim() !== '' && w >= 100 && h >= 100 && d > 0 && Number.isFinite(w + h + d);

  const run = (devices: readonly Device[], selectId?: string) =>
    saveCustom(devices)
      .then(() => selectId && select(selectId))
      .catch((error: unknown) => reportError(error, i18n));

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const device = customDevice(name.trim(), platform, w, h, d);
    void run([...custom, device], device.id).then(() => setName(''));
  };

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label={i18n.t('devices.list')} className="flex flex-col gap-1 text-sm">
        {custom.length === 0 && <li className="text-fg-muted">{i18n.t('devices.empty')}</li>}
        {custom.map((device) => (
          <li key={device.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{device.name}</span>
            <span className="font-mono text-xs text-fg-subtle">
              {device.logicalSize.width}×{device.logicalSize.height}
            </span>
            <IconButton
              label={i18n.t('devices.remove', { name: device.name })}
              icon={<Trash2 size={14} />}
              onClick={() => void run(custom.filter((item) => item.id !== device.id))}
            />
          </li>
        ))}
      </ul>

      <form onSubmit={add} className="grid grid-cols-2 gap-3">
        <Field label={i18n.t('devices.name')} className="col-span-2">
          {(field) => (
            <Input
              {...field}
              size="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label={i18n.t('devices.platform')}>
          {(field) => (
            <Select
              {...field}
              value={platform}
              onChange={(event) => {
                const next = event.target.value as Platform;
                setPlatform(next);
                setDensity(next === 'ios' ? '3' : '2.625');
              }}
            >
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </Select>
          )}
        </Field>
        <Field label={i18n.t('devices.density')}>
          {(field) => (
            <Input
              {...field}
              size="sm"
              inputMode="decimal"
              value={density}
              onChange={(event) => setDensity(event.target.value)}
            />
          )}
        </Field>
        <Field label={i18n.t('devices.width')}>
          {(field) => (
            <Input
              {...field}
              size="sm"
              inputMode="numeric"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
            />
          )}
        </Field>
        <Field label={i18n.t('devices.height')}>
          {(field) => (
            <Input
              {...field}
              size="sm"
              inputMode="numeric"
              value={height}
              onChange={(event) => setHeight(event.target.value)}
            />
          )}
        </Field>
        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="sm" variant="primary" disabled={!valid}>
            {i18n.t('devices.add')}
          </Button>
        </div>
      </form>
    </div>
  );
}
