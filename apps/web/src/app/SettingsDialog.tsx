import { useState, type FormEvent, type ReactNode } from 'react';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, Field, Input, Segmented, Switch } from '@rnjb/ui';
import type { Locale } from '@rnjb/i18n';
import type { TrashRetentionHours } from '@rnjb/core';
import type { RemoteSource } from '@rnjb/pack-schema';
import { parseRemoteUrl } from '@rnjb/remote-sources';
import { useService } from '../services/service-store.ts';
import { usePreferences, useT, type ThemePreference } from './preferences.ts';
import { useDialogs } from './dialogs-store.ts';
import { FolderBrowser } from './FolderBrowser.tsx';
import { reportError } from './report-error.ts';

export function SettingsDialog() {
  const open = useDialogs((state) => state.open === 'settings');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={i18n.t('settings.title')}
          description={i18n.t('settings.description')}
          closeLabel={i18n.t('common.close')}
          width={560}
        >
          <SettingsForm onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const i18n = useT();
  const status = useService((state) => state.status);
  const settings = useService((state) => state.settings);
  const saveSettings = useService((state) => state.saveSettings);
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const locale = usePreferences((state) => state.locale);
  const setLocale = usePreferences((state) => state.setLocale);
  const autosaveDraft = usePreferences((state) => state.autosaveDraft);
  const autosaveFile = usePreferences((state) => state.autosaveFile);
  const setAutosave = usePreferences((state) => state.setAutosave);

  const [workspacePath, setWorkspacePath] = useState(settings?.workspacePath ?? '');
  const [cacheDir, setCacheDir] = useState(settings?.cacheDir ?? '');
  const [skillsPath, setSkillsPath] = useState(settings?.skillsPath ?? '');
  const [retention, setRetention] = useState<TrashRetentionHours>(
    settings?.trashRetentionHours ?? 48,
  );
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialSources = Object.entries(settings?.librarySources ?? {}).flatMap(([pkg, source]) =>
    source.type === 'localPath' ? [{ pkg, path: source.path }] : [],
  );
  const [sources, setSources] = useState(initialSources);
  const [newPackage, setNewPackage] = useState('');
  const [newPath, setNewPath] = useState('');
  const online = status === 'online' && settings !== undefined;
  const initialRemotes = settings?.remoteSources ?? [];
  const [remotes, setRemotes] = useState<readonly RemoteSource[]>(initialRemotes);
  const remotesChanged = JSON.stringify(remotes) !== JSON.stringify(initialRemotes);
  const sourcesChanged = JSON.stringify(sources) !== JSON.stringify(initialSources);
  const changed =
    sourcesChanged ||
    remotesChanged ||
    workspacePath.trim() !== (settings?.workspacePath ?? '') ||
    cacheDir.trim() !== (settings?.cacheDir ?? '') ||
    skillsPath.trim() !== (settings?.skillsPath ?? '') ||
    retention !== (settings?.trashRetentionHours ?? 48);

  const addSource = () => {
    const pkg = newPackage.trim();
    const path = newPath.trim();
    if (!pkg || !path) return;
    setSources((previous) => [...previous.filter((row) => row.pkg !== pkg), { pkg, path }]);
    setNewPackage('');
    setNewPath('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings || !changed) return onDone();
    setSaving(true);
    try {
      const trimmed = workspacePath.trim();
      const {
        workspacePath: _previous,
        cacheDir: _previousCache,
        skillsPath: _previousSkills,
        ...rest
      } = settings;
      const keptSources = Object.fromEntries(
        Object.entries(settings.librarySources).filter(([, source]) => source.type !== 'localPath'),
      );
      const librarySources = {
        ...keptSources,
        ...Object.fromEntries(
          sources.map(({ pkg, path }) => [pkg, { type: 'localPath' as const, path }]),
        ),
      };
      const next = {
        ...rest,
        ...(cacheDir.trim() ? { cacheDir: cacheDir.trim() } : {}),
        ...(skillsPath.trim() ? { skillsPath: skillsPath.trim() } : {}),
        librarySources,
        remoteSources: [...remotes],
        trashRetentionHours: retention,
      };
      await saveSettings(trimmed ? { ...next, workspacePath: trimmed } : next);
      toast.success(i18n.t('settings.saved'));
      onDone();
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 pt-1">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('settings.workspace')}
        </h3>
        {browsing ? (
          <FolderBrowser
            initialPath={workspacePath || undefined}
            onCancel={() => setBrowsing(false)}
            onChoose={(path) => {
              setWorkspacePath(path);
              setBrowsing(false);
            }}
          />
        ) : (
          <Field
            label={i18n.t('settings.workspace')}
            hint={online ? i18n.t('settings.workspaceHint') : i18n.t('settings.needsService')}
          >
            {(field) => (
              <div className="flex gap-2">
                <Input
                  {...field}
                  mono
                  value={workspacePath}
                  disabled={!online}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setWorkspacePath(event.target.value)}
                />
                <Button disabled={!online} onClick={() => setBrowsing(true)}>
                  {i18n.t('settings.browse')}
                </Button>
              </div>
            )}
          </Field>
        )}
        <Field label={i18n.t('settings.skillsPath')} hint={i18n.t('settings.skillsPathHint')}>
          {(field) => (
            <Input
              {...field}
              mono
              value={skillsPath}
              disabled={!online}
              spellCheck={false}
              autoComplete="off"
              placeholder="~/.copilot/skills"
              onChange={(event) => setSkillsPath(event.target.value)}
            />
          )}
        </Field>
        <Field label={i18n.t('settings.cacheDir')} hint={i18n.t('settings.cacheDirHint')}>
          {(field) => (
            <Input
              {...field}
              mono
              value={cacheDir}
              disabled={!online}
              spellCheck={false}
              autoComplete="off"
              placeholder="~/.rnjb/cache"
              onChange={(event) => setCacheDir(event.target.value)}
            />
          )}
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('settings.libraries')}
        </h3>
        <p className="text-xs text-fg-muted">{i18n.t('settings.librariesHint')}</p>
        {sources.length === 0 && (
          <p className="text-sm text-fg-subtle">{i18n.t('settings.librariesNone')}</p>
        )}
        {sources.map(({ pkg, path }) => (
          <div key={pkg} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate font-mono text-xs" title={pkg}>
              {pkg}
            </span>
            <Input
              mono
              aria-label={i18n.t('settings.libraryPath', { package: pkg })}
              value={path}
              disabled={!online}
              spellCheck={false}
              onChange={(event) =>
                setSources((previous) =>
                  previous.map((row) =>
                    row.pkg === pkg ? { pkg, path: event.target.value } : row,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              disabled={!online}
              aria-label={i18n.t('settings.libraryRemove', { package: pkg })}
              onClick={() => setSources((previous) => previous.filter((row) => row.pkg !== pkg))}
            >
              <X size={14} aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            mono
            aria-label={i18n.t('settings.libraryPackage')}
            placeholder={i18n.t('settings.libraryPackage')}
            className="w-40 shrink-0"
            value={newPackage}
            disabled={!online}
            spellCheck={false}
            onChange={(event) => setNewPackage(event.target.value)}
          />
          <Input
            mono
            aria-label={i18n.t('settings.libraryPath', { package: newPackage || '…' })}
            placeholder="/ruta/absoluta"
            value={newPath}
            disabled={!online}
            spellCheck={false}
            onChange={(event) => setNewPath(event.target.value)}
          />
          <Button disabled={!online || !newPackage.trim() || !newPath.trim()} onClick={addSource}>
            {i18n.t('settings.libraryAdd')}
          </Button>
        </div>
      </section>

      <RemoteSourcesSection online={online} remotes={remotes} onChange={setRemotes} />

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('settings.appearance')}
        </h3>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">{i18n.t('settings.theme')}</span>
          <Segmented<ThemePreference>
            label={i18n.t('settings.theme')}
            value={theme}
            onValueChange={setTheme}
            options={[
              {
                value: 'system',
                label: i18n.t('settings.themeSystem'),
                icon: <Monitor size={13} />,
              },
              { value: 'light', label: i18n.t('settings.themeLight'), icon: <Sun size={13} /> },
              { value: 'dark', label: i18n.t('settings.themeDark'), icon: <Moon size={13} /> },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">{i18n.t('settings.language')}</span>
          <Segmented<Locale>
            label={i18n.t('settings.language')}
            value={locale}
            onValueChange={setLocale}
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          {i18n.t('settings.saving')}
        </h3>
        <SettingRow
          label={i18n.t('settings.autosaveDraft')}
          hint={i18n.t('settings.autosaveDraftHint')}
        >
          <Switch
            label={i18n.t('settings.autosaveDraft')}
            checked={autosaveDraft}
            onCheckedChange={(enabled) => setAutosave('draft', enabled)}
          />
        </SettingRow>
        <SettingRow
          label={i18n.t('settings.autosaveFile')}
          hint={i18n.t('settings.autosaveFileHint')}
        >
          <Switch
            label={i18n.t('settings.autosaveFile')}
            checked={autosaveFile}
            onCheckedChange={(enabled) => setAutosave('file', enabled)}
          />
        </SettingRow>
        <SettingRow
          label={i18n.t('settings.trashRetention')}
          hint={online ? i18n.t('settings.trashRetentionHint') : i18n.t('trash.needsService')}
        >
          <Segmented<'24' | '48'>
            label={i18n.t('settings.trashRetention')}
            value={String(retention) as '24' | '48'}
            onValueChange={(value) => online && setRetention(Number(value) as TrashRetentionHours)}
            options={[
              { value: '24', label: '24 h' },
              { value: '48', label: '48 h' },
            ]}
          />
        </SettingRow>
      </section>

      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line-subtle bg-panel px-5 py-3">
        <Button variant="ghost" onClick={onDone}>
          {i18n.t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={browsing}>
          {i18n.t('settings.save')}
        </Button>
      </div>
    </form>
  );
}

function RemoteSourcesSection({
  online,
  remotes,
  onChange,
}: {
  online: boolean;
  remotes: readonly RemoteSource[];
  onChange: (next: readonly RemoteSource[]) => void;
}) {
  const i18n = useT();
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState<Omit<RemoteSource, 'id'> | undefined>();
  const [failure, setFailure] = useState<string | undefined>();

  const interpret = () => {
    const result = parseRemoteUrl(url);
    if (!result.ok) {
      const { message, action } = i18n.error(result.error.code, result.error.params);
      setFailure(`${message} ${action}`);
      setDraft(undefined);
      return;
    }
    const { provider, remote, ref, path } = result.value;
    const repo =
      remote
        .replace(/\/+$/, '')
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') ?? remote;
    setFailure(undefined);
    setDraft({ name: repo, remote, ref: ref ?? '', path, provider });
  };
  const patch = (changes: Partial<Omit<RemoteSource, 'id'>>) =>
    setDraft((previous) => previous && { ...previous, ...changes });
  const add = () => {
    if (!draft || !draft.name.trim() || !draft.ref.trim()) return;
    onChange([
      ...remotes,
      {
        ...draft,
        id: crypto.randomUUID(),
        name: draft.name.trim(),
        ref: draft.ref.trim(),
        path: draft.path.trim().replace(/^\/+|\/+$/g, ''),
      },
    ]);
    setUrl('');
    setDraft(undefined);
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
        {i18n.t('settings.remotes')}
      </h3>
      <p className="text-xs text-fg-muted">{i18n.t('settings.remotesHint')}</p>
      {remotes.length === 0 && (
        <p className="text-sm text-fg-subtle">{i18n.t('settings.remotesNone')}</p>
      )}
      {remotes.map((source) => (
        <div key={source.id} className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{source.name}</span>
            <span className="truncate font-mono text-xs text-fg-muted" title={source.remote}>
              {source.remote} · {source.ref}
              {source.path && ` · ${source.path}`}
            </span>
          </div>
          <Button
            variant="ghost"
            disabled={!online}
            aria-label={i18n.t('settings.remoteRemove', { name: source.name })}
            onClick={() => onChange(remotes.filter((row) => row.id !== source.id))}
          >
            <X size={14} aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          mono
          aria-label={i18n.t('settings.remoteUrl')}
          placeholder={i18n.t('settings.remoteUrlPlaceholder')}
          value={url}
          disabled={!online}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button disabled={!online || !url.trim()} onClick={interpret}>
          {i18n.t('settings.remoteParse')}
        </Button>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-danger-fg">
          {failure}
        </p>
      )}
      {draft && (
        <div className="flex flex-col gap-3 rounded-md border border-line-subtle p-3">
          <Field label={i18n.t('settings.remoteName')}>
            {(field) => (
              <Input
                {...field}
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            )}
          </Field>
          <Field label={i18n.t('settings.remoteRepository')}>
            {(field) => (
              <Input
                {...field}
                mono
                value={draft.remote}
                spellCheck={false}
                onChange={(event) => patch({ remote: event.target.value })}
              />
            )}
          </Field>
          <Field
            label={i18n.t('settings.remoteRef')}
            hint={draft.ref ? undefined : i18n.t('settings.remoteRefMissing')}
          >
            {(field) => (
              <Input
                {...field}
                mono
                value={draft.ref}
                spellCheck={false}
                onChange={(event) => patch({ ref: event.target.value })}
              />
            )}
          </Field>
          <Field label={i18n.t('settings.remotePath')}>
            {(field) => (
              <Input
                {...field}
                mono
                value={draft.path}
                spellCheck={false}
                onChange={(event) => patch({ path: event.target.value })}
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button disabled={!draft.name.trim() || !draft.ref.trim()} onClick={add}>
              {i18n.t('settings.remoteAdd')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-fg-muted">{hint}</span>
      </div>
      {children}
    </div>
  );
}
