import { useRef, type KeyboardEvent } from 'react';
import { House, X } from 'lucide-react';
import { Badge, cx } from '@rnjb/ui';
import { useT } from './preferences.ts';
import { HOME_TAB, isFileDirty, useTabs } from './tabs-store.ts';
import { closeTab } from './persistence.ts';
import { MOD } from './dialogs-store.ts';

/** Document tabs (§5.1): Inicio is pinned; arrow keys move between tabs, Delete closes one. */
export function TabBar() {
  const i18n = useT();
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const activate = useTabs((state) => state.activate);
  const close = (id: string) => void closeTab(id);
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabId = (document.activeElement as HTMLElement | null)?.dataset['tabId'];
    if (event.key === 'Delete' && tabId) {
      close(tabId);
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next =
      items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    next?.focus();
    next?.click();
    event.preventDefault();
  };

  const tabClass = (active: boolean) =>
    cx(
      'group relative flex h-full max-w-[240px] min-w-0 shrink-0 items-center',
      active ? 'bg-canvas text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
      'after:absolute after:inset-x-0 after:top-0 after:h-[2px]',
      active && 'after:bg-accent',
    );

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line-subtle bg-chrome select-none">
      <div
        ref={listRef}
        role="tablist"
        aria-label={i18n.t('tabs.label')}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        <div className={tabClass(activeId === HOME_TAB)}>
          <button
            role="tab"
            aria-selected={activeId === HOME_TAB}
            tabIndex={activeId === HOME_TAB ? 0 : -1}
            title={`${i18n.t('tabs.home')} (${MOD}1)`}
            onClick={() => activate(HOME_TAB)}
            className="flex h-full items-center gap-2 px-3 text-xs font-medium"
          >
            <House size={14} aria-hidden />
            {i18n.t('tabs.home')}
          </button>
        </div>
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          const name = tab.title;
          return (
            <div key={tab.id} className={cx(tabClass(active), 'border-l border-line-subtle')}>
              <button
                role="tab"
                aria-selected={active}
                aria-keyshortcuts="Delete"
                data-tab-id={tab.id}
                tabIndex={active ? 0 : -1}
                title={index < 8 ? `${name} (${MOD}${index + 2})` : name}
                onClick={() => activate(tab.id)}
                onAuxClick={(event) => event.button === 1 && close(tab.id)}
                className="flex h-full min-w-0 items-center gap-2 pr-1 pl-3 text-xs font-medium"
              >
                <span className="truncate">{name}</span>
                {tab.kind === 'template' && <Badge tone="info">{i18n.t('tabs.template')}</Badge>}
                {isFileDirty(tab) && (
                  <span
                    role="img"
                    aria-label={i18n.t('tabs.unsaved')}
                    className="size-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
              </button>
              {/* A tablist may only hold tabs, so this pointer target stays out of the a11y tree;
                  keyboard users close a tab with Delete (aria-keyshortcuts on the tab). */}
              <span
                aria-hidden
                title={i18n.t('tabs.close', { name })}
                onClick={() => close(tab.id)}
                className={cx(
                  'mr-1 inline-flex size-5 cursor-default items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg',
                  !active && 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X size={13} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
