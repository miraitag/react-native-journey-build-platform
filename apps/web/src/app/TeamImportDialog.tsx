import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, DialogContent, Field, Input } from '@rnjb/ui';
import {
  TEAM_SCHEMA_VERSION,
  parseTeamConfig,
  validateTeamConfig,
  type PackageJsonImport,
  type TeamConfig,
} from '@rnjb/pack-schema';
import { localService } from '../services/local-service.ts';
import { useDialogs } from './dialogs-store.ts';
import { FolderBrowser } from './FolderBrowser.tsx';
import { useT } from './preferences.ts';
import { reportError } from './report-error.ts';

const TEAM_FILE = 'rnjb.team.json';

/** «Importar package.json» (§7.6): proposes the team libraries from a feature library and its example. */
export function TeamImportDialog() {
  const open = useDialogs((state) => state.open === 'team');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={i18n.t('team.title')}
          description={i18n.t('team.description')}
          closeLabel={i18n.t('common.close')}
          width={560}
        >
          <TeamImportBody onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Reads the workspace team file (empty when there is none); an invalid one is an error. */
export async function readTeamConfig(): Promise<TeamConfig> {
  const text = await localService.readFile(TEAM_FILE).then(
    (file) => file.contents,
    () => undefined,
  );
  if (text === undefined)
    return { schemaVersion: TEAM_SCHEMA_VERSION, activePacks: [], libraries: [] };
  // Never stand in an empty config for an invalid one: saving it would drop the user's fields.
  const parsed = parseTeamConfig(text);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}

function TeamImportBody({ onDone }: { onDone: () => void }) {
  const i18n = useT();
  const [library, setLibrary] = useState('');
  const [example, setExample] = useState('');
  const [browsing, setBrowsing] = useState<'library' | 'example' | undefined>();
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<PackageJsonImport>();

  const file = (folder: string) => `${folder.trim().replace(/\/+$/, '')}/package.json`;

  const read = async (event: FormEvent) => {
    event.preventDefault();
    if (!library.trim()) return;
    setBusy(true);
    try {
      setProposal(
        await localService.importPackageJson(
          file(library),
          example.trim() ? file(example) : undefined,
        ),
      );
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      const team = await readTeamConfig();
      const ranges = new Map(team.libraries.map((entry) => [entry.package, entry.range]));
      for (const entry of proposal.libraries) ranges.set(entry.package, entry.range);
      const next = validateTeamConfig({
        ...team,
        libraries: [...ranges].sort().map(([pkg, range]) => ({ package: pkg, range })),
        dependencyTemplate: proposal.dependencyTemplate,
      });
      if (!next.ok) throw next.error;
      await localService.writeFile(TEAM_FILE, `${JSON.stringify(next.value, null, 2)}\n`);
      toast.success(i18n.t('team.saved', { count: proposal.libraries.length }));
      onDone();
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setBusy(false);
    }
  };

  if (browsing)
    return (
      <FolderBrowser
        initialPath={(browsing === 'library' ? library : example) || undefined}
        onChoose={(path) => {
          (browsing === 'library' ? setLibrary : setExample)(path);
          setBrowsing(undefined);
        }}
        onCancel={() => setBrowsing(undefined)}
      />
    );

  return (
    <form onSubmit={(event) => void read(event)} className="flex flex-col gap-4 pt-1">
      {(['library', 'example'] as const).map((kind) => (
        <div key={kind} className="flex items-end gap-2">
          <Field label={i18n.t(`team.${kind}`)} className="flex-1">
            {(field) => (
              <Input
                {...field}
                size="sm"
                mono
                value={kind === 'library' ? library : example}
                onChange={(event) =>
                  (kind === 'library' ? setLibrary : setExample)(event.target.value)
                }
              />
            )}
          </Field>
          <Button size="sm" variant="secondary" onClick={() => setBrowsing(kind)}>
            {i18n.t('settings.browse')}
          </Button>
        </div>
      ))}

      {proposal && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-xs text-fg-muted">
            {i18n.t('team.found', { count: proposal.libraries.length })}
          </p>
          <ul className="max-h-40 overflow-auto font-mono text-xs">
            {proposal.libraries.map((entry) => (
              <li key={entry.package}>
                {entry.package} {entry.range}
              </li>
            ))}
          </ul>
          {proposal.skipped.length > 0 && (
            <p className="text-xs text-warning-fg">
              {i18n.t('team.skipped', {
                list: proposal.skipped.map((entry) => entry.package).join(', '),
              })}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {i18n.t('common.close')}
        </Button>
        {proposal ? (
          <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
            {i18n.t('team.save')}
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            variant="primary"
            loading={busy}
            disabled={!library.trim()}
          >
            {i18n.t('team.read')}
          </Button>
        )}
      </div>
    </form>
  );
}
