import type { ReactNode } from 'react';
import { Command } from 'cmdk';
import {
  FileText,
  FolderOpen,
  House,
  Keyboard,
  LayoutTemplate,
  PanelBottom,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Settings,
  SunMoon,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Kbd } from '@rnjb/ui';
import { selectEntries, useService } from '../services/service-store.ts';
import { usePreferences, useT } from './preferences.ts';
import { ALT, MOD, useDialogs } from './dialogs-store.ts';
import { HOME_TAB, canEdit, useTabs } from './tabs-store.ts';
import { openFromDisk, openWorkspaceEntry } from './open-document.ts';
import { saveAs, saveFile } from './persistence.ts';

/** Cmd+K (§10.3): actions, open tabs and workspace documents in one list. */
export function CommandPalette() {
  const open = useDialogs((state) => state.open === 'palette');
  const { show, hide } = useDialogs.getState();
  const i18n = useT();
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeId);
  const entries = useService(selectEntries);

  const run = (action: () => void) => () => {
    hide();
    action();
  };

  const toggleTheme = () => {
    const { resolvedTheme, setTheme } = usePreferences.getState();
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const active = tabs.find((tab) => tab.id === activeId);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => (next ? show('palette') : hide())}
      label={i18n.t('palette.label')}
      overlayClassName="fixed inset-0 z-40 bg-[oklch(0.18_0.01_256/0.32)]"
      contentClassName="fixed top-[14vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-lg bg-raised text-fg shadow-popover data-[state=open]:animate-[dialog-in_160ms_var(--ease-out)]"
    >
      <Command.Input
        placeholder={i18n.t('palette.placeholder')}
        className="h-11 w-full border-b border-line-subtle bg-transparent px-4 text-sm outline-none placeholder:text-fg-subtle"
      />
      <Command.List className="max-h-[50vh] overflow-auto p-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle">
        <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">
          {i18n.t('palette.empty')}
        </Command.Empty>
        <Command.Group heading={i18n.t('palette.actions')}>
          <Item
            icon={<Plus size={14} />}
            shortcut={`${ALT} N`}
            onSelect={run(() => show('create'))}
          >
            {i18n.t('home.actions.create')}
          </Item>
          <Item
            icon={<FolderOpen size={14} />}
            shortcut={`${MOD} O`}
            onSelect={run(() => void openFromDisk(i18n))}
          >
            {i18n.t('home.actions.openFile')}
          </Item>
          {active && (
            <Item
              icon={<PanelBottom size={14} />}
              shortcut={`${MOD} ⇧ M`}
              onSelect={run(() =>
                useTabs
                  .getState()
                  .updateView(active.id, { problemsOpen: !active.view.problemsOpen }),
              )}
            >
              {i18n.t('palette.toggleProblems')}
            </Item>
          )}
          {active && canEdit(active) && (
            <>
              <Item
                icon={<Save size={14} />}
                shortcut={`${MOD} S`}
                onSelect={run(() => void saveFile(active.id, { interactive: true }))}
              >
                {i18n.t('palette.save')}
              </Item>
              <Item
                icon={<SaveAll size={14} />}
                shortcut={`${MOD} ⇧ S`}
                onSelect={run(() => void saveAs(active.id))}
              >
                {i18n.t('palette.saveAs')}
              </Item>
              <Item
                icon={<Undo2 size={14} />}
                shortcut={`${MOD} Z`}
                onSelect={run(() => useTabs.getState().undo(active.id))}
              >
                {i18n.t('editor.topbar.undo')}
              </Item>
              <Item
                icon={<Redo2 size={14} />}
                shortcut={`${MOD} ⇧ Z`}
                onSelect={run(() => useTabs.getState().redo(active.id))}
              >
                {i18n.t('editor.topbar.redo')}
              </Item>
            </>
          )}
          <Item icon={<Trash2 size={14} />} onSelect={run(() => show('trash'))}>
            {i18n.t('trash.title')}
          </Item>
          <Item icon={<SunMoon size={14} />} onSelect={run(toggleTheme)}>
            {i18n.t('palette.toggleTheme')}
          </Item>
          <Item
            icon={<Settings size={14} />}
            shortcut={`${MOD} ,`}
            onSelect={run(() => show('settings'))}
          >
            {i18n.t('home.actions.settings')}
          </Item>
          <Item icon={<Keyboard size={14} />} shortcut="?" onSelect={run(() => show('shortcuts'))}>
            {i18n.t('palette.shortcuts')}
          </Item>
        </Command.Group>
        <Command.Group heading={i18n.t('palette.tabs')}>
          <Item
            icon={<House size={14} />}
            onSelect={run(() => useTabs.getState().activate(HOME_TAB))}
          >
            {i18n.t('tabs.home')}
          </Item>
          {tabs.map((tab) => (
            <Item
              key={tab.id}
              value={`tab ${tab.id} ${tab.title}`}
              icon={<FileText size={14} />}
              onSelect={run(() => useTabs.getState().activate(tab.id))}
            >
              {tab.title}
            </Item>
          ))}
        </Command.Group>
        {entries.length > 0 && (
          <Command.Group heading={i18n.t('palette.journeys')}>
            {entries.map((entry) => (
              <Item
                key={entry.path}
                value={`${entry.path} ${entry.name} ${entry.slug}`}
                icon={
                  entry.kind === 'template' ? <LayoutTemplate size={14} /> : <FileText size={14} />
                }
                onSelect={run(() => void openWorkspaceEntry(entry.path, i18n))}
              >
                {entry.name}
                <span className="ml-2 font-mono text-2xs text-fg-subtle">{entry.slug}</span>
              </Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Item({
  icon,
  shortcut,
  children,
  onSelect,
  value,
}: {
  icon: ReactNode;
  shortcut?: string;
  children: ReactNode;
  onSelect: () => void;
  value?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-sm data-[selected=true]:bg-hover"
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="flex min-w-0 flex-1 items-baseline truncate">{children}</span>
      {shortcut && <Kbd className="text-fg-muted">{shortcut}</Kbd>}
    </Command.Item>
  );
}
