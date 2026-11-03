import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { normalizeSlug } from '@rnjb/core';
import { profilePrefixes, defaultProfile } from '@rnjb/profiles';
import { Button, Dialog, DialogContent, Field, Input } from '@rnjb/ui';
import { FolderBrowser } from '../app/FolderBrowser.tsx';
import { useDialogs } from '../app/dialogs-store.ts';
import { openText } from '../app/open-document.ts';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { suggestSlug } from '../home/CreateJourneyDialog.tsx';
import { localService } from '../services/local-service.ts';
import { selectEntries, useService } from '../services/service-store.ts';

const prefixes = profilePrefixes(defaultProfile);

/** Import a feature library from a folder into a new journey (§17). The folder is only read. */
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

function ImportBody({ onDone }: { onDone: () => void }) {
  const i18n = useT();
  const entries = useService(selectEntries);
  const refreshIndex = useService((state) => state.refreshIndex);
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Awaited<ReturnType<typeof localService.importRepository>>>();

  const slug = normalizeSlug(suggestSlug(name), {
    prefixes,
    existing: entries.map((entry) => entry.slug),
  });
  const ready = folder.trim() !== '' && name.trim() !== '' && slug.ok;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !slug.ok) return;
    setBusy(true);
    try {
      const result = await localService.importRepository(folder, name.trim(), slug.value.slug);
      setReport(result);
      void refreshIndex();
      const { contents } = await localService.readFile(result.path);
      await openText(contents, { type: 'workspace', path: result.path }, name.trim(), i18n);
      toast.success(i18n.t('import.done', { name: name.trim() }));
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
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
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4 pt-1">
      <div className="flex items-end gap-2">
        <Field label={i18n.t('import.folder')} className="flex-1">
          {(field) => (
            <Input
              {...field}
              size="sm"
              mono
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
            />
          )}
        </Field>
        <Button size="sm" variant="secondary" onClick={() => setBrowsing(true)}>
          {i18n.t('settings.browse')}
        </Button>
      </div>
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
            onChange={(event) => setName(event.target.value)}
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
        {!report && (
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!ready}>
            {i18n.t('import.run')}
          </Button>
        )}
      </div>
    </form>
  );
}
