import { Dialog, DialogContent, Kbd } from '@rnjb/ui';
import { useT } from './preferences.ts';
import { ALT, MOD, useDialogs } from './dialogs-store.ts';

export function ShortcutsDialog() {
  const open = useDialogs((state) => state.open === 'shortcuts');
  const hide = useDialogs((state) => state.hide);
  const i18n = useT();

  const t = (key: Parameters<typeof i18n.t>[0]) => i18n.t(key);
  const click = t('shortcuts.click');
  const groups: [string, [string, string[]][]][] = [
    [
      t('shortcuts.groupGeneral'),
      [
        [t('shortcuts.palette'), [MOD, 'K']],
        [t('shortcuts.help'), ['?']],
        [t('shortcuts.tabs'), [MOD, '1–9']],
        [t('shortcuts.closeTab'), ['Supr']],
        [t('shortcuts.settings'), [MOD, ',']],
        [t('shortcuts.newJourney'), [ALT, 'N']],
        [t('shortcuts.openFile'), [MOD, 'O']],
        [t('shortcuts.save'), [MOD, 'S']],
        [t('shortcuts.saveAs'), [MOD, '⇧', 'S']],
        [t('shortcuts.undo'), [MOD, 'Z']],
        [t('shortcuts.redo'), [MOD, '⇧', 'Z']],
        [t('shortcuts.problems'), [MOD, '⇧', 'M']],
      ],
    ],
    [
      t('shortcuts.groupCanvas'),
      [
        [t('shortcuts.pan'), [t('shortcuts.space'), t('shortcuts.drag')]],
        [t('shortcuts.scroll'), [t('shortcuts.twoFingers')]],
        [t('shortcuts.pinch'), [t('shortcuts.pinchKeys')]],
        [t('shortcuts.zoom'), [MOD, '+ / −']],
        [t('shortcuts.zoom100'), ['⇧', '0']],
        [t('shortcuts.fit'), ['⇧', '1']],
        [t('shortcuts.fitSelection'), ['⇧', '2']],
        [t('shortcuts.nudgeScreen'), ['← ↑ → ↓']],
        [t('shortcuts.flow'), ['⇧', 'F']],
      ],
    ],
    [
      t('shortcuts.groupSelection'),
      [
        [t('shortcuts.multiSelect'), ['⇧', click]],
        [t('shortcuts.selectChildren'), ['Enter']],
        [t('shortcuts.selectParent'), ['Esc']],
        [t('shortcuts.selectNext'), ['Tab']],
        [t('shortcuts.selectAll'), [MOD, 'A']],
      ],
    ],
    [
      t('shortcuts.groupEdit'),
      [
        [t('shortcuts.delete'), ['⌫']],
        [t('shortcuts.copy'), [MOD, 'C']],
        [t('shortcuts.cut'), [MOD, 'X']],
        [t('shortcuts.paste'), [MOD, 'V']],
        [t('shortcuts.duplicate'), [MOD, 'D']],
        [t('shortcuts.wrap'), [MOD, 'G']],
        [t('shortcuts.unwrap'), [MOD, '⇧', 'G']],
        [t('shortcuts.moveNode'), [ALT, '↑ / ↓']],
      ],
    ],
    [
      t('shortcuts.groupPrototype'),
      [
        [t('shortcuts.prototypeBack'), ['⌫ / ←']],
        [t('shortcuts.prototypeExit'), ['Esc']],
      ],
    ],
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent
        title={i18n.t('shortcuts.title')}
        closeLabel={i18n.t('common.close')}
        width={520}
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
          {groups.map(([title, rows]) => (
            <section key={title}>
              <h3 className="pb-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
                {title}
              </h3>
              <dl className="divide-y divide-line-subtle">
                {rows.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <dt>{label}</dt>
                    <dd className="flex shrink-0 gap-1 text-fg-muted">
                      {keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
