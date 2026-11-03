import { Suspense, lazy, useState } from 'react';
import { toast } from 'sonner';
import type {
  CheckResult,
  ExportEntry,
  ExportPlanResult,
  ExportScope,
  ExportStatus,
} from '@rnjb/codegen';
import { zipFiles } from '@rnjb/codegen/zip';
import { Badge, Button, Dialog, DialogContent, Field, Input, Segmented, Spinner } from '@rnjb/ui';
import type { Tone } from '@rnjb/ui';
import { FolderBrowser } from '../app/FolderBrowser.tsx';
import { useDialogs } from '../app/dialogs-store.ts';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { localService } from '../services/local-service.ts';

const TONES: Record<ExportStatus, Tone> = {
  new: 'success',
  unchanged: 'neutral',
  update: 'info',
  merged: 'info',
  conflict: 'danger',
};

const DiffEditor = lazy(() => import('./DiffEditor.tsx'));

const hasMarkers = (text: string): boolean => /^<<<<<<< /m.test(text);
const SUBFOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface Choice {
  include: boolean;
  text: string;
  /** Conflicts must be settled by the person before anything is written. */
  resolved: boolean;
}

/** Export to a folder with a file-by-file review before anything is written (§16). */
export function ExportDialog() {
  const document = useDialogs((state) => state.exportDocument);
  const open = useDialogs((state) => state.open === 'export' && state.exportDocument !== undefined);
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && document && (
        <DialogContent
          title={i18n.t('export.title', { name: document.meta.name })}
          description={i18n.t('export.description')}
          closeLabel={i18n.t('common.close')}
          width={720}
        >
          <ExportBody onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ExportBody({ onDone }: { onDone: () => void }) {
  const i18n = useT();
  const document = useDialogs((state) => state.exportDocument);
  const [folder, setFolder] = useState('');
  const [sub, setSub] = useState('');
  const [scope, setScope] = useState<ExportScope>('project');
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportPlanResult>();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selected, setSelected] = useState<string>();
  const [written, setWritten] = useState<number>();
  const [checks, setChecks] = useState<CheckResult[]>();

  if (!document) return null;
  const subValid = sub === '' || SUBFOLDER.test(sub);
  const target = sub ? `${folder.replace(/\/+$/, '')}/${sub}` : folder;
  const ready = folder.trim() !== '' && subValid;

  const review = async () => {
    setBusy(true);
    setWritten(undefined);
    setChecks(undefined);
    try {
      const planned = await localService.planExport(document, target, scope);
      setResult(planned);
      setChoices(
        Object.fromEntries(
          planned.plan.entries
            .filter((entry) => entry.status !== 'unchanged')
            .map((entry) => [
              entry.path,
              {
                include: entry.status !== 'conflict',
                text: entry.proposed,
                resolved: entry.status !== 'conflict',
              },
            ]),
        ),
      );
      setSelected(planned.plan.entries.find((entry) => entry.status !== 'unchanged')?.path);
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const patch = (path: string, change: Partial<Choice>) =>
    setChoices((previous) => {
      const current = previous[path];
      return current ? { ...previous, [path]: { ...current, ...change } } : previous;
    });

  const pending = Object.values(choices).filter((choice) => choice.include && !choice.resolved);
  const included = Object.entries(choices).filter(([, choice]) => choice.include);

  const write = async () => {
    setBusy(true);
    try {
      const files = Object.fromEntries(included.map(([path, choice]) => [path, choice.text]));
      const done = await localService.applyExport(
        document,
        target,
        scope,
        files,
        result?.onDisk ?? {},
      );
      setWritten(done.written.length);
      toast.success(i18n.t('export.done', { count: done.written.length }));
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const files = Object.fromEntries(
      (result?.plan.entries ?? [])
        .filter((item) => choices[item.path]?.include !== false)
        .map((item) => [item.path, choices[item.path]?.text ?? item.proposed]),
    );
    const link = globalThis.document.createElement('a');
    link.href = URL.createObjectURL(new Blob([zipFiles(files)], { type: 'application/zip' }));
    link.download = `${sub || 'export'}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const runChecks = async () => {
    setBusy(true);
    try {
      setChecks(await localService.checkExport(document, target));
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const entries = result?.plan.entries ?? [];
  const entry = entries.find((candidate) => candidate.path === selected);
  const choice = selected ? choices[selected] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {browsing ? (
        <FolderBrowser
          initialPath={folder || undefined}
          onChoose={(path) => {
            setFolder(path);
            setBrowsing(false);
            setResult(undefined);
          }}
          onCancel={() => setBrowsing(false)}
        />
      ) : (
        <>
          <div className="flex items-end gap-2">
            <Field label={i18n.t('export.folder')} className="flex-1">
              {(field) => (
                <Input
                  {...field}
                  size="sm"
                  mono
                  value={folder}
                  onChange={(event) => {
                    setFolder(event.target.value);
                    setResult(undefined);
                  }}
                />
              )}
            </Field>
            <Button size="sm" variant="secondary" onClick={() => setBrowsing(true)}>
              {i18n.t('settings.browse')}
            </Button>
          </div>
          <div className="flex items-end gap-3">
            <Field
              label={i18n.t('export.subfolder')}
              hint={i18n.t('export.subfolderHint')}
              error={subValid ? undefined : i18n.t('export.subfolderInvalid')}
              className="flex-1"
            >
              {(field) => (
                <Input
                  {...field}
                  size="sm"
                  mono
                  value={sub}
                  onChange={(event) => {
                    setSub(event.target.value);
                    setResult(undefined);
                  }}
                />
              )}
            </Field>
            <Segmented<ExportScope>
              label={i18n.t('export.scope')}
              value={scope}
              onValueChange={(next) => {
                setScope(next);
                setResult(undefined);
              }}
              options={[
                { value: 'project', label: i18n.t('export.scopeProject') },
                { value: 'src', label: i18n.t('export.scopeSrc') },
              ]}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={!ready || busy}
              onClick={() => void review()}
            >
              {i18n.t('export.review')}
            </Button>
          </div>
        </>
      )}

      {busy && <Spinner size={14} className="text-fg-subtle" />}

      {result && result.missing.length > 0 && (
        <div role="alert" className="text-sm text-danger-fg">
          <p>{i18n.t('export.missing')}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {result.missing.map((item, index) => (
              <li key={`${item.screen}-${item.name}-${index}`}>
                {item.screen} · {item.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.missing.length === 0 && (
        <>
          <div className="flex flex-col gap-1 text-xs text-fg-muted">
            {result.dirty && (
              <p role="note" className="text-warning-fg">
                {i18n.t('export.dirty')}
              </p>
            )}
            <p>
              {result.git
                ? i18n.t(result.hasLock ? 'export.modeGit' : 'export.modeGitNoLock')
                : i18n.t(result.hasLock ? 'export.modeLock' : 'export.modeNew')}
            </p>
            {result.plan.stale.length > 0 && (
              <p>{i18n.t('export.stale', { files: result.plan.stale.join(', ') })}</p>
            )}
          </div>

          {Object.keys(choices).length === 0 ? (
            <p className="text-sm">{i18n.t('export.nothing')}</p>
          ) : (
            <div className="grid grid-cols-[240px_1fr] gap-3">
              <ul
                aria-label={i18n.t('export.files')}
                className="max-h-72 overflow-auto rounded-md bg-input py-1 shadow-[inset_0_0_0_1px_var(--line-control)]"
              >
                {entries
                  .filter((candidate) => candidate.status !== 'unchanged')
                  .map((candidate) => (
                    <FileRow
                      key={candidate.path}
                      entry={candidate}
                      selected={candidate.path === selected}
                      included={choices[candidate.path]?.include ?? false}
                      resolved={choices[candidate.path]?.resolved ?? true}
                      onSelect={() => setSelected(candidate.path)}
                      onToggle={(include) => patch(candidate.path, { include })}
                    />
                  ))}
              </ul>
              {entry && choice && (
                <Review
                  entry={entry}
                  choice={choice}
                  onChange={(change) => patch(entry.path, change)}
                />
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {pending.length > 0 && (
              <p role="note" className="mr-auto text-xs text-warning-fg">
                {i18n.t('export.conflictsPending', { count: pending.length })}
              </p>
            )}
            {written !== undefined && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void runChecks()}
              >
                {i18n.t('export.runChecks')}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pending.length > 0} onClick={download}>
              {i18n.t('export.zip')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              {i18n.t('common.close')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || pending.length > 0 || written !== undefined}
              onClick={() => void write()}
            >
              {included.length === 1
                ? i18n.t('export.writeOne')
                : i18n.t('export.write', { count: included.length })}
            </Button>
          </div>
        </>
      )}

      {checks && (
        <ul className="flex flex-col gap-2 text-xs">
          {checks.map((check) => (
            <li key={check.id}>
              {check.skipped ? (
                <p className="text-fg-muted">
                  {check.description} · {i18n.t('export.checkSkipped', { path: check.output })}
                </p>
              ) : (
                <p className={check.ok ? 'text-success-fg' : 'text-danger-fg'}>
                  {check.description} · {i18n.t(check.ok ? 'export.checkOk' : 'export.checkFailed')}
                </p>
              )}
              {!check.ok && !check.skipped && (
                <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-input p-2 font-mono">
                  {check.output}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  entry,
  selected,
  included,
  resolved,
  onSelect,
  onToggle,
}: {
  entry: ExportEntry;
  selected: boolean;
  included: boolean;
  resolved: boolean;
  onSelect: () => void;
  onToggle: (include: boolean) => void;
}) {
  const i18n = useT();
  return (
    <li className="flex items-center gap-2 px-2 py-1" aria-current={selected || undefined}>
      <input
        type="checkbox"
        aria-label={i18n.t('export.include', { path: entry.path })}
        checked={included}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <button
        type="button"
        onClick={onSelect}
        title={entry.path}
        className={`min-w-0 flex-1 truncate text-left font-mono text-xs ${selected ? 'text-accent-fg' : ''}`}
      >
        {entry.path}
      </button>
      <Badge tone={entry.status === 'conflict' && resolved ? 'success' : TONES[entry.status]}>
        {i18n.t(`export.status.${entry.status}`)}
      </Badge>
    </li>
  );
}

function Review({
  entry,
  choice,
  onChange,
}: {
  entry: ExportEntry;
  choice: Choice;
  onChange: (change: Partial<Choice>) => void;
}) {
  const i18n = useT();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {entry.twoWay && entry.status === 'conflict' && (
        <p className="text-xs text-fg-muted">{i18n.t('export.twoWay')}</p>
      )}
      {entry.status === 'conflict' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ text: entry.ours, resolved: true, include: true })}
          >
            {i18n.t('export.useOurs')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onChange({ text: entry.theirs ?? '', resolved: true, include: true })}
          >
            {i18n.t('export.useTheirs')}
          </Button>
        </div>
      )}
      <p className="text-xs text-fg-muted">
        {i18n.t('export.current')} →{' '}
        {entry.status === 'conflict' ? i18n.t('export.editResult') : i18n.t('export.result')}
      </p>
      <Suspense fallback={<Spinner size={14} className="text-fg-subtle" />}>
        <DiffEditor
          key={entry.path}
          path={entry.path}
          original={entry.theirs ?? ''}
          value={choice.text}
          label={entry.path}
          onChange={(text) =>
            onChange({
              text,
              resolved: entry.status !== 'conflict' || !hasMarkers(text),
            })
          }
        />
      </Suspense>
    </div>
  );
}
