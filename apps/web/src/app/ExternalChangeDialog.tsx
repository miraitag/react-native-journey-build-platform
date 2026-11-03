import { useState } from 'react';
import { compareDocuments } from '@rnjb/core';
import { Button, Dialog, DialogContent } from '@rnjb/ui';
import { ComparisonSummary } from '../home/ComparisonSummary.tsx';
import { useExternalChanges } from './external-changes.ts';
import { keepMine, reloadFromDisk } from './persistence.ts';
import { useT } from './preferences.ts';
import { reportError } from './report-error.ts';

/** The open journey changed on disk and has changes of its own: compare, keep mine or reload (§6.5). */
export function ExternalChangeDialog() {
  const conflict = useExternalChanges((state) => state.conflict);
  const dismiss = useExternalChanges((state) => state.dismiss);
  const i18n = useT();
  const [comparing, setComparing] = useState(false);

  const close = () => {
    setComparing(false);
    dismiss();
  };
  const keep = () => {
    if (conflict) keepMine(conflict.tabId, conflict.disk.integrity);
    close();
  };
  const reload = () => {
    if (conflict) reloadFromDisk(conflict.tabId).catch((error: unknown) => reportError(error));
    close();
  };

  return (
    <Dialog open={conflict !== undefined} onOpenChange={(next) => !next && close()}>
      {conflict && (
        <DialogContent
          title={i18n.t('external.title', { name: conflict.name })}
          description={i18n.t('external.description')}
          closeLabel={i18n.t('common.close')}
          width={520}
        >
          <div className="flex flex-col gap-4">
            {comparing && (
              <ComparisonSummary comparison={compareDocuments(conflict.local, conflict.disk)} />
            )}
            <div className="flex justify-end gap-2">
              {!comparing && (
                <Button size="sm" variant="ghost" onClick={() => setComparing(true)}>
                  {i18n.t('external.compare')}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={keep}>
                {i18n.t('external.keep')}
              </Button>
              <Button size="sm" variant="primary" onClick={reload}>
                {i18n.t('external.reload')}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
