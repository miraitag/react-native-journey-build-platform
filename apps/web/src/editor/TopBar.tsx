import { useState, useEffect, type ReactNode } from 'react';
import {
  CircleAlert,
  Download,
  LayoutTemplate,
  Moon,
  PanelLeft,
  PanelRight,
  Redo2,
  Smartphone,
  Sun,
  TriangleAlert,
  Undo2,
  Upload,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';
import { renameJourney, type Command, type RnjbDocument, type Screen } from '@rnjb/core';
import { canExport, defaultProfile } from '@rnjb/profiles';
import { Button, IconButton, Input, Segmented, Select, WithTooltip, cx } from '@rnjb/ui';
import { usePreferences, useT } from '../app/preferences.ts';
import { MOD, useDialogs } from '../app/dialogs-store.ts';
import { reportError } from '../app/report-error.ts';
import { MAX_COMPARED, useDevices, osVersionOf } from '../services/device-store.ts';
import { useService } from '../services/service-store.ts';
import { saveFile } from '../app/persistence.ts';
import {
  canEdit,
  isDraftPending,
  isFileDirty,
  useTabs,
  type DocumentTab,
  type ViewState,
} from '../app/tabs-store.ts';
import type { Problem } from './problems.ts';
import { StatesDialog } from './StatesDialog.tsx';

/** Disabled controls still explain why (§10.4); the wrapper keeps the tooltip reachable. */
function Blocked({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <WithTooltip label={<span className="max-w-[280px]">{reason}</span>}>
      <span tabIndex={0} className="inline-flex rounded-md">
        {children}
      </span>
    </WithTooltip>
  );
}

/** The template is a copy of the saved file, so pending changes are written first. */
async function saveAsTemplate(tab: DocumentTab) {
  if (tab.source.type !== 'workspace') return;
  const path = tab.source.path;
  if (isFileDirty(tab)) await saveFile(tab.id, { interactive: true });
  const saved = useTabs.getState().tabs.find((entry) => entry.id === tab.id);
  if (saved && isFileDirty(saved)) return;
  useDialogs.getState().showDerive({ path, name: tab.title, target: 'template' });
}

interface TopBarProps {
  tab: DocumentTab;
  document: RnjbDocument;
  screen: Screen | undefined;
  problems: Problem[];
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onView: (patch: Partial<ViewState>) => void;
  onRun: (command: Command) => void;
}

/** «Borrador guardado · Archivo pendiente» (§18.2): both levels, each with its own state. */
function SaveIndicator({ tab }: { tab: DocumentTab }) {
  const i18n = useT();
  const autosaveDraft = usePreferences((state) => state.autosaveDraft);
  if (tab.mode === 'recovery') {
    return (
      <span role="status" className="mr-2 flex items-center gap-1.5 text-xs text-fg-muted">
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
        {i18n.t('editor.save.readOnly')}
      </span>
    );
  }
  const fileDirty = isFileDirty(tab);
  const draft = !fileDirty
    ? undefined
    : isDraftPending(tab)
      ? autosaveDraft
        ? i18n.t('editor.save.draftSaving')
        : i18n.t('editor.save.draftOff')
      : i18n.t('editor.save.draftSaved');
  const file =
    tab.fileStatus === 'saving'
      ? i18n.t('editor.save.fileSaving')
      : tab.fileStatus === 'error'
        ? i18n.t('editor.save.fileError')
        : tab.source.type === 'memory'
          ? i18n.t('editor.save.noFile')
          : fileDirty
            ? i18n.t('editor.save.filePending')
            : i18n.t('editor.save.saved');
  const tone =
    tab.fileStatus === 'error'
      ? 'bg-danger'
      : !fileDirty
        ? 'bg-success'
        : isDraftPending(tab)
          ? 'bg-fg-subtle'
          : 'bg-warning';
  const error = tab.fileError ? i18n.error(tab.fileError.code, tab.fileError.params) : undefined;
  const label = (
    <span role="status" className="mr-2 flex items-center gap-1.5 text-xs text-fg-muted">
      <span aria-hidden className={cx('size-1.5 rounded-full', tone)} />
      {draft ? `${draft} · ${file}` : file}
    </span>
  );
  if (!fileDirty && !error) return label;
  return (
    <WithTooltip
      label={
        <span className="max-w-[280px]">
          {error ? `${error.message} ${error.action}` : i18n.t('editor.save.hint', { mod: MOD })}
        </span>
      }
    >
      <button
        type="button"
        className="rounded-md hover:bg-hover"
        onClick={() => void saveFile(tab.id, { interactive: true })}
      >
        {label}
      </button>
    </WithTooltip>
  );
}

function JourneyName({
  document,
  editable,
  onRun,
}: {
  document: RnjbDocument;
  editable: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(document.meta.name);
  const commit = () => {
    setEditing(false);
    const name = value.trim();
    if (name && name !== document.meta.name) onRun(renameJourney(name));
  };
  return (
    <div className="mr-2 ml-1 flex min-w-0 flex-col leading-tight">
      {editing ? (
        <Input
          size="sm"
          autoFocus
          aria-label={i18n.t('editor.topbar.rename')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setEditing(false);
          }}
          className="h-6 w-[220px]"
        />
      ) : (
        <button
          type="button"
          disabled={!editable}
          title={editable ? i18n.t('editor.topbar.rename') : undefined}
          onClick={() => {
            setValue(document.meta.name);
            setEditing(true);
          }}
          className="truncate rounded-sm text-left text-sm font-medium enabled:hover:text-accent-fg"
        >
          {document.meta.name}
        </button>
      )}
      <span className="truncate font-mono text-2xs text-fg-subtle">{document.meta.slug}</span>
    </div>
  );
}

export function TopBar({
  tab,
  document,
  screen,
  problems,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  onView,
  onRun,
}: TopBarProps) {
  const i18n = useT();
  const { view } = tab;
  const editable = canEdit(tab);
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.filter((problem) => problem.severity === 'warning').length;
  const online = useService((state) => state.status === 'online');
  const devices = useDevices((state) => state.devices);
  const selectedDevice = useDevices((state) => state.selectedId);
  const loadDevices = useDevices((state) => state.load);
  const selectDevice = useDevices((state) => state.select);
  const osVersions = useDevices((state) => state.osVersions);
  const selectOsVersion = useDevices((state) => state.selectOsVersion);
  const orientation = useDevices((state) => state.orientation);
  const setOrientation = useDevices((state) => state.setOrientation);
  const postures = useDevices((state) => state.postures);
  const selectPosture = useDevices((state) => state.selectPosture);
  const compareIds = useDevices((state) => state.compareIds);
  const setCompare = useDevices((state) => state.setCompare);
  const activeDevice = devices.find((device) => device.id === selectedDevice);
  const exportable =
    online &&
    tab.kind === 'journey' &&
    document.profile.id === defaultProfile.id &&
    canExport(defaultProfile);

  useEffect(() => {
    if (online) loadDevices().catch((error: unknown) => reportError(error, i18n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, loadDevices]);

  const deviceSelect = (
    <Select
      aria-label={i18n.t('editor.topbar.device')}
      disabled={devices.length === 0}
      className="w-[196px]"
      value={selectedDevice ?? ''}
      onChange={(event) => selectDevice(event.target.value)}
    >
      {devices.length === 0 ? (
        <option value="">{i18n.t('editor.topbar.noDevices')}</option>
      ) : (
        devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))
      )}
    </Select>
  );

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line-subtle bg-panel px-2">
      <IconButton
        label={i18n.t('editor.panels.left')}
        active={leftOpen}
        icon={<PanelLeft size={15} />}
        onClick={onToggleLeft}
      />
      <JourneyName document={document} editable={editable} onRun={onRun} />

      <div className="mx-1 h-5 w-px bg-line-subtle" />
      <IconButton
        label={i18n.t('editor.topbar.undo')}
        shortcut={`${MOD} Z`}
        icon={<Undo2 size={15} />}
        disabled={!editable || tab.history.past.length === 0}
        onClick={() => useTabs.getState().undo(tab.id)}
      />
      <IconButton
        label={i18n.t('editor.topbar.redo')}
        shortcut={`${MOD} ⇧ Z`}
        icon={<Redo2 size={15} />}
        disabled={!editable || tab.history.future.length === 0}
        onClick={() => useTabs.getState().redo(tab.id)}
      />
      <div className="mx-1 h-5 w-px bg-line-subtle" />

      {devices.length === 0 ? (
        <Blocked reason={i18n.t('editor.topbar.noDevices')}>{deviceSelect}</Blocked>
      ) : (
        deviceSelect
      )}
      <IconButton
        label={i18n.t('devices.manage')}
        icon={<Smartphone size={15} />}
        disabled={!online}
        onClick={() => useDialogs.getState().show('devices')}
      />
      {activeDevice && (
        <Select
          aria-label={i18n.t('editor.topbar.osVersion')}
          className="w-[110px]"
          value={osVersionOf(activeDevice, osVersions)}
          onChange={(event) => selectOsVersion(activeDevice.id, event.target.value)}
        >
          {activeDevice.osVersions.map((version) => (
            <option key={version} value={version}>
              {i18n.t('editor.topbar.osVersionLabel', {
                platform: activeDevice.platform === 'ios' ? 'iOS' : 'Android',
                version,
              })}
            </option>
          ))}
        </Select>
      )}
      <Segmented<'portrait' | 'landscape'>
        label={i18n.t('editor.topbar.orientation')}
        iconOnly
        value={orientation}
        onValueChange={setOrientation}
        options={[
          {
            value: 'portrait',
            label: i18n.t('editor.topbar.portrait'),
            icon: <RectangleVertical size={13} />,
          },
          {
            value: 'landscape',
            label: i18n.t('editor.topbar.landscape'),
            icon: <RectangleHorizontal size={13} />,
          },
        ]}
      />
      {activeDevice?.postures && activeDevice.postures.length > 0 && (
        <Select
          aria-label={i18n.t('editor.topbar.posture')}
          className="w-[120px]"
          value={postures[activeDevice.id] ?? ''}
          onChange={(event) => selectPosture(activeDevice.id, event.target.value || undefined)}
        >
          <option value="">{i18n.t('editor.topbar.postureClosed')}</option>
          {activeDevice.postures.map((posture) => (
            <option key={posture.id} value={posture.id}>
              {posture.name}
            </option>
          ))}
        </Select>
      )}
      {devices.length > 1 && (
        <Select
          aria-label={i18n.t('editor.topbar.compare')}
          className="w-[130px]"
          value=""
          onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            setCompare(
              compareIds.includes(id)
                ? compareIds.filter((other) => other !== id)
                : [...compareIds, id].slice(-MAX_COMPARED),
            );
          }}
        >
          <option value="">
            {compareIds.length > 0
              ? i18n.t('editor.topbar.compareCount', { count: compareIds.length })
              : i18n.t('editor.topbar.compareNone')}
          </option>
          {devices
            .filter((device) => device.id !== selectedDevice)
            .map((device) => (
              <option key={device.id} value={device.id}>
                {compareIds.includes(device.id) ? `✓ ${device.name}` : device.name}
              </option>
            ))}
        </Select>
      )}
      <Select
        aria-label={i18n.t('editor.topbar.state')}
        className="w-[130px]"
        disabled={!screen || screen.states.length === 0}
        value={view.stateId ?? ''}
        onChange={(event) => onView({ stateId: event.target.value })}
      >
        {!screen || screen.states.length === 0 ? (
          <option value="">{i18n.t('editor.topbar.noStates')}</option>
        ) : (
          screen.states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))
        )}
      </Select>
      {screen && (
        <StatesDialog
          screen={screen}
          stateId={view.stateId}
          editable={editable}
          onRun={onRun}
          onSelectState={(stateId) => onView({ stateId })}
        />
      )}
      <Segmented<'light' | 'dark'>
        label={i18n.t('editor.topbar.previewTheme')}
        iconOnly
        value={view.previewTheme}
        onValueChange={(previewTheme) => onView({ previewTheme })}
        options={[
          { value: 'light', label: i18n.t('settings.themeLight'), icon: <Sun size={13} /> },
          { value: 'dark', label: i18n.t('settings.themeDark'), icon: <Moon size={13} /> },
        ]}
      />

      <div className="flex-1" />

      <SaveIndicator tab={tab} />

      <button
        type="button"
        aria-pressed={view.problemsOpen}
        title={`${i18n.t('editor.problems.toggle')} (${MOD} ⇧ M)`}
        onClick={() => onView({ problemsOpen: !view.problemsOpen })}
        className={cx(
          'tabular inline-flex h-[var(--control-h-sm)] items-center gap-1.5 rounded-md px-2 text-xs',
          view.problemsOpen
            ? 'bg-accent-subtle text-accent-fg'
            : 'text-fg-muted hover:bg-hover hover:text-fg',
        )}
      >
        <CircleAlert size={13} aria-hidden className={errors > 0 ? 'text-danger' : undefined} />
        {errors}
        <TriangleAlert
          size={13}
          aria-hidden
          className={cx('ml-1', warnings > 0 && 'text-warning-fg')}
        />
        {warnings}
        <span className="sr-only">{i18n.t('editor.problems.summary', { errors, warnings })}</span>
      </button>

      {tab.kind === 'journey' && (
        <IconButton
          label={i18n.t('home.card.saveAsTemplate')}
          icon={<LayoutTemplate size={15} />}
          disabled={tab.source.type !== 'workspace'}
          onClick={() => void saveAsTemplate(tab)}
        />
      )}

      {online && canExport(defaultProfile) ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() => useDialogs.getState().show('import')}
        >
          {i18n.t('editor.topbar.import')}
        </Button>
      ) : (
        <Blocked reason={i18n.t('editor.topbar.importBlocked')}>
          <Button size="sm" variant="ghost" icon={<Download size={14} />} disabled>
            {i18n.t('editor.topbar.import')}
          </Button>
        </Blocked>
      )}
      {exportable ? (
        <Button
          size="sm"
          variant="primary"
          icon={<Upload size={14} />}
          onClick={() => useDialogs.getState().showExport(document)}
        >
          {i18n.t('editor.topbar.export')}
        </Button>
      ) : (
        <Blocked reason={i18n.t('editor.topbar.exportBlocked')}>
          <Button size="sm" variant="primary" icon={<Upload size={14} />} disabled>
            {i18n.t('editor.topbar.export')}
          </Button>
        </Blocked>
      )}
      <IconButton
        label={i18n.t('editor.inspector.label')}
        active={rightOpen}
        icon={<PanelRight size={15} />}
        onClick={onToggleRight}
      />
    </div>
  );
}
