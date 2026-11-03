import { Dialog, DialogContent, Kbd } from '@rnjb/ui';
import { useT } from './preferences.ts';
import { ALT, MOD, useDialogs } from './dialogs-store.ts';

export function ShortcutsDialog() {
  const open = useDialogs((state) => state.open === 'shortcuts');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();

  const rows: [string, string[]][] = [
    [i18n.t('shortcuts.palette'), [MOD, 'K']],
    [i18n.t('shortcuts.help'), ['?']],
    [i18n.t('shortcuts.tabs'), [MOD, '1–9']],
    [i18n.t('shortcuts.closeTab'), ['Supr']],
    [i18n.t('shortcuts.settings'), [MOD, ',']],
    [i18n.t('shortcuts.newJourney'), [ALT, 'N']],
    [i18n.t('shortcuts.openFile'), [MOD, 'O']],
    [i18n.t('shortcuts.save'), [MOD, 'S']],
    [i18n.t('shortcuts.saveAs'), [MOD, '⇧', 'S']],
    [i18n.t('shortcuts.undo'), [MOD, 'Z']],
    [i18n.t('shortcuts.redo'), [MOD, '⇧', 'Z']],
    [i18n.t('shortcuts.delete'), ['⌫']],
    [i18n.t('shortcuts.problems'), [MOD, '⇧', 'M']],
    [i18n.t('shortcuts.zoom'), [MOD, '+ / −']],
    [i18n.t('shortcuts.fit'), ['⇧', '1']],
    [i18n.t('shortcuts.fitSelection'), ['⇧', '2']],
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent
        title={i18n.t('shortcuts.title')}
        closeLabel={i18n.t('common.close')}
        width={440}
      >
        <dl className="divide-y divide-line-subtle">
          {rows.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
              <dt>{label}</dt>
              <dd className="flex gap-1 text-fg-muted">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
