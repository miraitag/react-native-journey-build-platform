import { useEffect, useState } from 'react';
import { compareDocuments, type DocumentComparison, type WorkspaceEntry } from '@rnjb/core';
import { Button, Dialog, DialogContent } from '@rnjb/ui';
import { useDialogs } from '../app/dialogs-store.ts';
import { useT } from '../app/preferences.ts';
import { loadUpdatePair, replaceFromOrigin } from '../app/remote-update.ts';
import { reportError } from '../app/report-error.ts';
import { ComparisonSummary } from './ComparisonSummary.tsx';

interface Loaded {
  comparison: DocumentComparison;
  localChanges: boolean;
}

/** «Comparar» a copy of a remote item with its origin, and «Reemplazar» it when it is untouched (§6.4). */
export function RemoteCompareDialog() {
  const copy = useDialogs((state) => state.compare);
  const open = useDialogs((state) => state.open === 'compare' && state.compare !== undefined);
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && copy && (
        <DialogContent
          title={i18n.t('home.remote.compareTitle', { name: copy.name })}
          description={i18n.t('home.remote.compareDescription')}
          closeLabel={i18n.t('common.close')}
          width={520}
        >
          <CompareBody copy={copy} onDone={hide} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CompareBody({ copy, onDone }: { copy: WorkspaceEntry; onDone: () => void }) {
  const i18n = useT();
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadUpdatePair(copy, i18n).then(
      (pair) => {
        if (cancelled) return;
        if (!pair) return setFailed(true);
        setLoaded({
          comparison: compareDocuments(pair.local, pair.remote),
          localChanges: pair.localChanges,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        setFailed(true);
        reportError(error, i18n);
      },
    );
    return () => {
      cancelled = true;
    };
    // The comparison is loaded once per opened dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy]);

  if (failed)
    return <p className="text-sm text-danger-fg">{i18n.t('home.remote.compareFailed')}</p>;
  if (!loaded) return <p className="text-sm text-fg-muted">{i18n.t('home.remote.comparing')}</p>;

  const { comparison, localChanges } = loaded;
  const replace = async () => {
    setWorking(true);
    const done = await replaceFromOrigin(copy, i18n);
    setWorking(false);
    if (done) onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <ComparisonSummary comparison={comparison} />
      {localChanges && (
        <p role="note" className="text-xs text-warning-fg">
          {i18n.t('home.remote.replaceBlocked')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {i18n.t('home.remote.keep')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={localChanges || working}
          onClick={() => void replace()}
        >
          {i18n.t('home.remote.replace')}
        </Button>
      </div>
    </div>
  );
}
