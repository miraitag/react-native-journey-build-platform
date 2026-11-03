import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { normalizeSlug } from '@rnjb/core';
import { profilePrefixes, defaultProfile } from '@rnjb/profiles';
import { Button, Dialog, DialogContent, Field, Input, Segmented, Select } from '@rnjb/ui';
import { parseRemoteUrl } from '@rnjb/remote-sources';
import { FolderBrowser } from '../app/FolderBrowser.tsx';
import { useDialogs } from '../app/dialogs-store.ts';
import { openText } from '../app/open-document.ts';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { suggestSlug } from '../home/CreateJourneyDialog.tsx';
import { localService, type ImportResult, type ImportSource } from '../services/local-service.ts';
import { selectEntries, useService } from '../services/service-store.ts';

const prefixes = profilePrefixes(defaultProfile);

/**
 * Import a feature library from a folder or a git URL into a new journey (§17). The repository is
 * only read, and the report is reviewed before anything is written (§17.5).
 */
export function ImportDialog() {
  const open = useDialogs((state) => state.open === 'import');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={i18n.t('import.title')}
          description={i18n.t('import.description')}
          closeLabel={i18n.t('common.close')}
          width={560}
        >
          <ImportBody onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

type SourceMode = 'folder' | 'git';

function ImportBody({ onDone }: { onDone: () => void }) {
  const i18n = useT();
  const entries = useService(selectEntries);
  const refreshIndex = useService((state) => state.refreshIndex);
  const [mode, setMode] = useState<SourceMode>('folder');
  const [folder, setFolder] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [name, setName] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportResult>();

  const slug = normalizeSlug(suggestSlug(name), {
    prefixes,
    existing: entries.map((entry) => entry.slug),
  });
  // A Bitbucket browse URL names the clone URL, the ref and a folder (§17.1, §6.4).
  const parsed = mode === 'git' && url.trim() !== '' ? parseRemoteUrl(url.trim()) : undefined;
  const gitRef = ref.trim() || (parsed?.ok ? (parsed.value.ref ?? '') : '');
  const source: ImportSource | undefined =
    mode === 'folder'
      ? folder.trim()
        ? { folder: folder.trim() }
        : undefined
      : parsed?.ok && gitRef
        ? {
            git: {
              url: parsed.value.remote,
              ref: gitRef,
              ...(parsed.value.path ? { path: parsed.value.path } : {}),
            },
          }
        : undefined;
  const ready = source !== undefined && name.trim() !== '' && slug.ok;
  // Any change to the inputs invalidates the reviewed report.
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setReport(undefined);
    };

  const analyse = async (profileId?: string) => {
    if (!ready || !slug.ok || !source) return;
    setBusy(true);
    try {
      setReport(
        await localService.importRepository(source, {
          name: name.trim(),
          slug: slug.value.slug,
          dryRun: true,
          ...(profileId ? { profileId } : {}),
        }),
      );
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!report || !slug.ok || !source) return;
    setBusy(true);
    try {
      const result = await localService.importRepository(source, {
        name: name.trim(),
        slug: slug.value.slug,
        profileId: report.used,
      });
      void refreshIndex();
      const { contents } = await localService.readFile(result.path);
      await openText(contents, { type: 'workspace', path: result.path }, name.trim(), i18n);
      toast.success(i18n.t('import.done', { name: name.trim() }));
      onDone();
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void (report ? create() : analyse());
  };

  if (browsing)
    return (
      <FolderBrowser
        initialPath={folder || undefined}
        onChoose={(path) => {
          setFolder(path);
          setBrowsing(false);
        }}
        onCancel={() => setBrowsing(false)}
      />
    );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pt-1">
      <Segmented<SourceMode>
        label={i18n.t('import.source')}
        value={mode}
        onValueChange={edit(setMode)}
        options={[
          { value: 'folder', label: i18n.t('import.sourceFolder') },
          { value: 'git', label: i18n.t('import.sourceGit') },
        ]}
      />
      {mode === 'folder' ? (
        <div className="flex items-end gap-2">
          <Field label={i18n.t('import.folder')} className="flex-1">
            {(field) => (
              <Input
                {...field}
                size="sm"
                mono
                value={folder}
                onChange={(event) => edit(setFolder)(event.target.value)}
              />
            )}
          </Field>
          <Button size="sm" variant="secondary" onClick={() => setBrowsing(true)}>
            {i18n.t('settings.browse')}
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <Field
            label={i18n.t('import.url')}
            className="flex-1"
            {...(parsed && !parsed.ok
              ? { error: i18n.error(parsed.error.code, parsed.error.params).message }
              : parsed?.ok && parsed.value.path
                ? { hint: i18n.t('import.urlFolder', { path: parsed.value.path }) }
                : {})}
          >
            {(field) => (
              <Input
                {...field}
                size="sm"
                mono
                value={url}
                onChange={(event) => edit(setUrl)(event.target.value)}
              />
            )}
          </Field>
          <Field label={i18n.t('import.ref')} className="w-36">
            {(field) => (
              <Input
                {...field}
                size="sm"
                mono
                placeholder={parsed?.ok ? parsed.value.ref : undefined}
                value={ref}
                onChange={(event) => edit(setRef)(event.target.value)}
              />
            )}
          </Field>
        </div>
      )}
      <Field
        label={i18n.t('create.name')}
        hint={slug.ok ? slug.value.slug : i18n.t('create.slugHint')}
      >
        {(field) => (
          <Input
            {...field}
            size="sm"
            maxLength={120}
            value={name}
            onChange={(event) => edit(setName)(event.target.value)}
          />
        )}
      </Field>

      {report && (
        <div className="flex flex-col gap-2 text-sm">
          <p className={report.profile.detected ? 'text-fg-muted' : 'text-warning-fg'}>
            {i18n.t(report.profile.detected ? 'import.profile' : 'import.profileFallback', {
              id: report.profile.id,
              percent: Math.round(report.profile.score * 100),
              threshold: Math.round(report.profile.threshold * 100),
            })}
          </p>
          <Field label={i18n.t('import.useProfile')}>
            {(field) => (
              <Select
                {...field}
                value={report.used}
                disabled={busy}
                onChange={(event) => void analyse(event.target.value)}
              >
                {report.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {`${profile.id} (${Math.round(profile.score * 100)} %)`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <ul>
            {report.report.screens.map((screen) => (
              <li key={screen.name}>
                {i18n.t('import.coverage', {
                  name: screen.name,
                  percent: Math.round(screen.coverage * 100),
                  blocks: screen.codeBlocks,
                })}
              </li>
            ))}
          </ul>
          {report.report.keptWhole.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted">
                {i18n.t('import.kept', { count: report.report.keptWhole.length })}
              </p>
              <ul className="max-h-32 overflow-auto font-mono text-xs">
                {report.report.keptWhole.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          )}
          {report.skipped.length > 0 && (
            <div>
              <p className="text-xs text-warning-fg">
                {i18n.t('import.skipped', { count: report.skipped.length })}
              </p>
              <ul className="max-h-32 overflow-auto font-mono text-xs">
                {report.skipped.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {i18n.t('common.close')}
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!ready}>
          {i18n.t(report ? 'import.create' : 'import.analyse')}
        </Button>
      </div>
    </form>
  );
}
