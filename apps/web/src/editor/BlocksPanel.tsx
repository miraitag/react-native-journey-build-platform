import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { extractFragment, withStrings, type RnjbDocument, type Screen } from '@rnjb/core';
import { Button, EmptyState, Input } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { useBlocks } from '../services/blocks-store.ts';
import { useLibraries } from '../services/library-store.ts';
import { useService } from '../services/service-store.ts';
import { blockFromFragment, blockId, draggedOfBlock } from './blocks.ts';
import { useCatalogDrag } from './catalog-drag.ts';
import type { DraggedComponent } from './insert-component.ts';

/** Blocks (§7.5): save the selection as a block, then drag or add it as one unit. */
export function BlocksPanel({
  document,
  screen,
  selection,
  onAdd,
}: {
  document: RnjbDocument;
  screen: Screen | undefined;
  /** Selected node ids of the screen, primary first. */
  selection: readonly string[];
  /** Present when a screen is selected and the document is editable. */
  onAdd?: ((item: DraggedComponent) => void) | undefined;
}) {
  const i18n = useT();
  const online = useService((state) => state.status === 'online');
  const blocks = useBlocks((state) => state.blocks);
  const own = useBlocks((state) => state.own);
  const load = useBlocks((state) => state.load);
  const save = useBlocks((state) => state.save);
  const packs = useLibraries((state) => state.packs);
  const startDrag = useCatalogDrag((state) => state.start);
  const endDrag = useCatalogDrag((state) => state.end);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (online) load().catch((error: unknown) => reportError(error));
  }, [online, load]);

  const fragment = screen && extractFragment(screen, selection);
  const canSave = online && fragment !== undefined && name.trim() !== '' && !saving;

  const onSave = async () => {
    if (!fragment) return;
    const label = name.trim();
    const taken = new Set(own?.blocks.map((block) => block.id));
    const version = packs.find((pack) => pack.package === 'react-native')?.packageVersion ?? '*';
    const block = blockFromFragment(
      withStrings(fragment, document.strings),
      label,
      blockId(label, taken),
      { package: 'react-native', component: 'View', version },
    );
    setSaving(true);
    try {
      await save(block);
      setName('');
      toast.success(i18n.t('editor.blocks.saved', { name: label }));
    } catch (error) {
      reportError(error, i18n);
    } finally {
      setSaving(false);
    }
  };

  if (!online) {
    return (
      <EmptyState title={i18n.t('editor.blocks.emptyTitle')}>
        {i18n.t('editor.catalog.needsService')}
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void onSave();
        }}
      >
        <Input
          size="sm"
          aria-label={i18n.t('editor.blocks.name')}
          placeholder={i18n.t('editor.blocks.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={!canSave}>
          {i18n.t('editor.blocks.save')}
        </Button>
        {!fragment && (
          <p className="text-2xs text-fg-muted">{i18n.t('editor.blocks.selectFirst')}</p>
        )}
      </form>
      {blocks.length === 0 ? (
        <EmptyState title={i18n.t('editor.blocks.emptyTitle')}>
          {i18n.t('editor.blocks.emptyBody')}
        </EmptyState>
      ) : (
        <ul aria-label={i18n.t('editor.panels.blocks')} className="flex flex-col">
          {blocks.map(({ key, block }) => (
            <li
              key={key}
              className="flex items-center rounded-sm [contain-intrinsic-size:auto_28px] [content-visibility:auto] hover:bg-hover"
            >
              <button
                type="button"
                disabled={!onAdd}
                draggable={Boolean(onAdd)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('text/plain', block.name);
                  startDrag(draggedOfBlock(block));
                }}
                onDragEnd={endDrag}
                aria-label={i18n.t('editor.catalog.add', { name: block.name })}
                onClick={() => onAdd?.(draggedOfBlock(block))}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1.5 py-1 text-left text-sm disabled:cursor-default"
              >
                <span className="truncate">{block.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
