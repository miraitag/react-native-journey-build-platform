import { RotateCcw, X } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, EmptyState, IconButton } from '@rnjb/ui';
import { useService } from '../services/service-store.ts';
import { useT } from '../app/preferences.ts';
import { useDialogs } from '../app/dialogs-store.ts';
import { deleteForever, remainingLabel, restoreItem, useFileTrash, useNow } from '../app/trash.ts';

/** Deleted journeys and templates (§18.4). Restoring needs the local service. */
export function TrashDialog() {
  const open = useDialogs((state) => state.open === 'trash');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      {open && (
        <DialogContent
          title={i18n.t('trash.title')}
          description={i18n.t('trash.description')}
          closeLabel={i18n.t('common.close')}
          width={520}
        >
          <TrashList />
        </DialogContent>
      )}
    </Dialog>
  );
}

function TrashList() {
  const i18n = useT();
  const now = useNow();
  const items = useFileTrash();
  const online = useService((state) => state.status === 'online');
  const hours = useService((state) => state.settings?.trashRetentionHours ?? 48);
  if (items.length === 0) {
    return (
      <EmptyState title={i18n.t('editor.trash.emptyTitle')}>
        {i18n.t('editor.trash.emptyBody', { hours })}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line-subtle">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                {item.kind === 'template' && <Badge tone="info">{i18n.t('tabs.template')}</Badge>}
              </span>
              <span className="truncate text-xs text-fg-muted">
                {remainingLabel(item, now, i18n)}
              </span>
            </div>
            <Button
              size="sm"
              icon={<RotateCcw size={13} />}
              disabled={!online}
              title={online ? undefined : i18n.t('trash.needsService')}
              onClick={() => void restoreItem(item)}
            >
              {i18n.t('trash.restore')}
            </Button>
            <IconButton
              label={i18n.t('trash.deleteForever', { name: item.label })}
              icon={<X size={14} />}
              onClick={() => void deleteForever([item.id])}
            />
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => void deleteForever(items.map((item) => item.id))}
      >
        {i18n.t('trash.empty')}
      </Button>
    </div>
  );
}
