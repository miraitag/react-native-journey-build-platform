import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import type { EntryOrigin, WorkspaceEntry } from '@rnjb/core';
import {
  FileClock,
  FileWarning,
  FolderOpen,
  GitCompare,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Replace,
  Search,
  ServerOff,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Segmented,
  Skeleton,
} from '@rnjb/ui';
import { selectEntries, useService } from '../services/service-store.ts';
import { hasUpdate, useRemotes } from '../services/remote-store.ts';
import type { RemoteSource } from '@rnjb/pack-schema';
import type { DraftRow } from '../services/db.ts';
import { usePreferences, useT } from '../app/preferences.ts';
import { ALT, MOD, useDialogs } from '../app/dialogs-store.ts';
import {
  openFromDisk,
  openRemoteEntry,
  openWorkspaceEntry,
  reportError,
} from '../app/open-document.ts';
import { discardDraft, openDraft } from '../app/persistence.ts';
import { replaceFromOrigin } from '../app/remote-update.ts';
import { useTabs } from '../app/tabs-store.ts';
import { trashEntry, useDirtyDrafts } from '../app/trash.ts';
import { FirstSteps } from './FirstSteps.tsx';
import { OutlineMap } from './OutlineMap.tsx';
import { formatAbsolute, formatRelative } from './format-date.ts';

type OriginFilter = 'all' | EntryOrigin;

const RECENT_COUNT = 4;

const matches = (entry: WorkspaceEntry, query: string): boolean => {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    entry.name.toLowerCase().includes(needle) ||
    entry.slug.includes(needle) ||
    entry.libraries.some((library) => library.toLowerCase().includes(needle))
  );
};

export function Home() {
  const i18n = useT();
  const status = useService((state) => state.status);
  const settings = useService((state) => state.settings);
  const index = useService((state) => state.index);
  const indexing = useService((state) => state.indexing);
  const connect = useService((state) => state.connect);
  const refreshIndex = useService((state) => state.refreshIndex);
  const show = useDialogs((state) => state.show);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const deferredQuery = useDeferredValue(query.trim());

  const entries = (index?.entries ?? []).filter(
    (entry) => (origin === 'all' || entry.origin === origin) && matches(entry, deferredQuery),
  );
  const byDate = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  // Copies of remote items live in the workspace and are listed with the rest; the remote
  // items themselves come from the synchronized sources (RemoteSections).
  const journeys = byDate.filter((entry) => entry.kind === 'journey');
  const templates = byDate.filter((entry) => entry.kind === 'template');
  const recent =
    deferredQuery || origin !== 'all' || journeys.length <= RECENT_COUNT
      ? []
      : journeys.slice(0, RECENT_COUNT);
  const hasWorkspace = Boolean(settings?.workspacePath);
  const total = index?.entries.length ?? 0;

  return (
    <div className="h-full overflow-auto bg-canvas">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-8 pt-6 pb-12">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-lg font-semibold">{i18n.t('app.name')}</h1>
          <IconButton
            label={i18n.t('trash.title')}
            icon={<Trash2 size={15} />}
            onClick={() => show('trash')}
          />
          <Button
            icon={<FolderOpen size={14} />}
            title={`${MOD} O`}
            onClick={() => void openFromDisk(i18n)}
          >
            {i18n.t('home.actions.openFile')}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            title={`${ALT} N`}
            onClick={() => show('create')}
          >
            {i18n.t('home.actions.create')}
          </Button>
        </header>

        <FirstSteps />

        <Drafts />

        {status === 'checking' && !index ? (
          <CardGridSkeleton />
        ) : status === 'offline' ? (
          <EmptyState
            className="rounded-lg bg-panel px-6 shadow-[0_0_0_1px_var(--line-subtle)]"
            icon={<ServerOff size={20} />}
            title={i18n.t('home.empty.noServiceTitle')}
            actions={
              <>
                <Button size="sm" icon={<RefreshCw size={13} />} onClick={() => void connect()}>
                  {i18n.t('common.retry')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<FolderOpen size={13} />}
                  onClick={() => void openFromDisk(i18n)}
                >
                  {i18n.t('home.actions.openFile')}
                </Button>
              </>
            }
          >
            {i18n.t('home.empty.noServiceBody')}
          </EmptyState>
        ) : !hasWorkspace ? (
          <EmptyState
            className="rounded-lg bg-panel px-6 shadow-[0_0_0_1px_var(--line-subtle)]"
            icon={<FolderOpen size={20} />}
            title={i18n.t('home.empty.noWorkspaceTitle')}
            actions={
              <Button
                size="sm"
                variant="primary"
                icon={<Settings size={13} />}
                onClick={() => show('settings')}
              >
                {i18n.t('home.actions.chooseWorkspace')}
              </Button>
            }
          >
            {i18n.t('home.empty.noWorkspaceBody')}
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-[360px]">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle"
                />
                <Input
                  type="search"
                  aria-label={i18n.t('home.search')}
                  placeholder={i18n.t('home.search')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-8"
                />
              </div>
              <Segmented<OriginFilter>
                label={i18n.t('home.filters.label')}
                value={origin}
                onValueChange={setOrigin}
                options={[
                  { value: 'all', label: i18n.t('home.filters.all') },
                  { value: 'local', label: i18n.t('home.filters.local') },
                  { value: 'imported', label: i18n.t('home.filters.imported') },
                  { value: 'remote', label: i18n.t('home.filters.remote') },
                ]}
              />
              <IconButton
                label={i18n.t('home.actions.refresh')}
                icon={
                  <RefreshCw
                    size={14}
                    className={indexing ? 'animate-spin motion-reduce:animate-none' : undefined}
                  />
                }
                onClick={() => void refreshIndex()}
                disabled={indexing}
              />
            </div>

            {index && index.invalid.length > 0 && (
              <p className="-mt-4 flex items-center gap-2 text-xs text-warning-fg">
                <FileWarning size={14} aria-hidden />
                {i18n.t('home.invalid', { count: index.invalid.length })}
              </p>
            )}

            {total === 0 ? (
              <EmptyState
                className="rounded-lg bg-panel px-6 shadow-[0_0_0_1px_var(--line-subtle)]"
                title={i18n.t('home.empty.noJourneysTitle')}
                actions={
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={13} />}
                    onClick={() => show('create')}
                  >
                    {i18n.t('home.actions.create')}
                  </Button>
                }
              >
                {i18n.t('home.empty.noJourneysBody')}
              </EmptyState>
            ) : entries.length === 0 ? (
              <p className="text-sm text-fg-muted">
                {i18n.t('home.empty.noResults', { query: deferredQuery })}
              </p>
            ) : (
              <>
                {recent.length > 0 && (
                  <Section title={i18n.t('home.sections.recent')} entries={recent} />
                )}
                {(origin === 'all' || journeys.length > 0) && (
                  <Section title={i18n.t('home.sections.journeys')} entries={journeys} />
                )}
                {(origin === 'all' || origin === 'local' || templates.length > 0) && (
                  <Section
                    title={i18n.t('home.sections.templates')}
                    entries={templates}
                    empty={i18n.t('home.empty.noTemplates')}
                  />
                )}
              </>
            )}
            {(origin === 'all' || origin === 'remote') && <RemoteSections query={deferredQuery} />}
          </>
        )}
      </div>
    </div>
  );
}

function Drafts() {
  const i18n = useT();
  const locale = usePreferences((state) => state.locale);
  const tabs = useTabs((state) => state.tabs);
  const drafts = useDirtyDrafts();
  const [discarding, setDiscarding] = useState<ReadonlySet<string>>(new Set());
  const visible = drafts.filter(
    (draft) => !discarding.has(draft.docKey) && !tabs.some((tab) => tab.id === draft.docKey),
  );
  if (visible.length === 0) return null;

  // Discarding waits a few seconds so the toast can undo it.
  const discard = (draft: DraftRow) => {
    const toggle = (on: boolean) =>
      setDiscarding((previous) => {
        const next = new Set(previous);
        if (on) next.add(draft.docKey);
        else next.delete(draft.docKey);
        return next;
      });
    toggle(true);
    const timer = setTimeout(() => void discardDraft(draft.docKey), 6000);
    toast(i18n.t('home.drafts.discarded', { name: draft.name }), {
      duration: 6000,
      action: {
        label: i18n.t('editor.topbar.undo'),
        onClick: () => {
          clearTimeout(timer);
          toggle(false);
        },
      },
    });
  };

  const title = i18n.t('home.sections.drafts');
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        <span className="tabular text-xs font-normal text-fg-muted">{visible.length}</span>
      </h2>
      <p className="max-w-[72ch] text-xs text-fg-muted">{i18n.t('home.drafts.body')}</p>
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg bg-panel shadow-[0_0_0_1px_var(--line-subtle)]">
        {visible.map((draft) => (
          <li key={draft.docKey} className="flex items-center gap-3 px-3 py-2">
            <FileClock size={15} aria-hidden className="shrink-0 text-warning-fg" />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{draft.name}</span>
              <span className="truncate text-xs text-fg-muted">
                {draft.source.type === 'workspace'
                  ? draft.source.path
                  : draft.source.type === 'file'
                    ? draft.source.name
                    : i18n.t('editor.save.noFile')}{' '}
                ·{' '}
                <time dateTime={draft.savedAt} title={formatAbsolute(draft.savedAt, locale)}>
                  {i18n.t('home.drafts.savedAt', { date: formatRelative(draft.savedAt, locale) })}
                </time>
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => discard(draft)}>
              {i18n.t('home.drafts.discard')}
            </Button>
            <Button size="sm" onClick={() => void openDraft(draft.docKey)}>
              {i18n.t('home.drafts.continue')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: WorkspaceEntry[];
  empty?: string;
}) {
  if (entries.length === 0 && !empty) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {entries.length > 0 && (
          <span className="tabular text-xs font-normal text-fg-muted">{entries.length}</span>
        )}
      </h2>
      {entries.length === 0 ? (
        <p className="max-w-[72ch] text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3">
          {entries.map((entry) => (
            <li key={entry.path}>
              <JourneyCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const NO_SOURCES: readonly RemoteSource[] = [];

const copyOf = (copies: readonly WorkspaceEntry[], item: WorkspaceEntry) =>
  copies.find(
    (copy) =>
      copy.remote?.remote === item.remote?.remote && copy.remote?.path === item.remote?.path,
  );

function RemoteSections({ query }: { query: string }) {
  const i18n = useT();
  const sources = useService((state) => state.settings?.remoteSources ?? NO_SOURCES);
  const results = useRemotes((state) => state.results);
  const syncing = useRemotes((state) => state.syncing);
  const sync = useRemotes((state) => state.sync);
  const check = () =>
    sync().then(
      (fresh) => {
        if (fresh.every((result) => !result.error)) toast.success(i18n.t('home.remote.checked'));
      },
      (error: unknown) => reportError(error, i18n),
    );
  return (
    <section aria-label={i18n.t('home.filters.remote')} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{i18n.t('home.filters.remote')}</h2>
        {sources.length > 0 && (
          <Button size="sm" variant="ghost" disabled={syncing} onClick={() => void check()}>
            <RefreshCw aria-hidden className={syncing ? 'animate-spin' : undefined} />
            {i18n.t('home.remote.check')}
          </Button>
        )}
      </div>
      {sources.length === 0 && (
        <p className="max-w-[72ch] text-sm text-fg-muted">{i18n.t('home.empty.noRemote')}</p>
      )}
      {sources.map((source) => {
        const result = results.find((item) => item.id === source.id);
        const entries = result?.entries.filter((entry) => matches(entry, query)) ?? [];
        const failure = result?.error && i18n.error(result.error.code, result.error.params);
        return (
          <div key={source.id} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-fg-muted">
              {i18n.t('home.remote.source', { name: source.name, ref: source.ref })}
            </h3>
            {failure && (
              <p role="alert" className="text-sm text-danger-fg">
                {failure.message} {failure.action}
              </p>
            )}
            {!result && <p className="text-sm text-fg-muted">{i18n.t('home.remote.checking')}</p>}
            {result && !failure && result.entries.length === 0 && (
              <p className="text-sm text-fg-muted">{i18n.t('home.remote.empty')}</p>
            )}
            {entries.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3">
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <JourneyCard entry={entry} sourceId={source.id} />
                  </li>
                ))}
              </ul>
            )}
            {result?.stale && (
              <p className="text-xs text-fg-subtle">{i18n.t('home.remote.stale')}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function JourneyCard({ entry, sourceId }: { entry: WorkspaceEntry; sourceId?: string }) {
  const i18n = useT();
  const locale = usePreferences((state) => state.locale);
  const showDerive = useDialogs((state) => state.showDerive);
  const showCompare = useDialogs((state) => state.showCompare);
  const results = useRemotes((state) => state.results);
  const copies = useService(selectEntries);
  // A remote item with a local copy opens the copy; a copy whose origin moved offers the update.
  const copy = sourceId === undefined ? undefined : copyOf(copies, entry);
  const update =
    sourceId === undefined
      ? hasUpdate(results, entry)
      : copy?.remote?.commit !== undefined && copy.remote.commit !== entry.remote?.commit;
  const screens =
    entry.screenCount === 0
      ? i18n.t('home.card.noScreens')
      : entry.screenCount === 1
        ? i18n.t('home.card.oneScreen')
        : i18n.t('home.card.screens', { count: entry.screenCount });

  return (
    <div className="group/card relative">
      {/* Only the name is the button; its ::after stretches over the card (WCAG 2.5.3 label in name). */}
      <div className="group relative flex w-full flex-col overflow-hidden rounded-lg bg-panel text-left shadow-[0_0_0_1px_var(--line-subtle)] transition-shadow duration-[var(--duration-fast)] has-focus-visible:shadow-[0_0_0_1px_var(--focus),0_0_0_3px_var(--accent-muted)] hover:shadow-[0_0_0_1px_var(--line-control),var(--shadow-frame)]">
        <div className="h-[116px] border-b border-line-subtle bg-canvas p-3">
          {entry.screenCount > 0 ? (
            <OutlineMap outline={entry.outline} />
          ) : (
            <div className="flex size-full items-center justify-center rounded-md border border-dashed border-line text-xs text-fg-subtle">
              {screens}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 px-3 pt-2.5 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={i18n.t('home.card.open', { name: entry.name })}
              onClick={() =>
                void (sourceId === undefined
                  ? openWorkspaceEntry(entry.path, i18n)
                  : openRemoteEntry(sourceId, entry, i18n))
              }
              className="truncate text-left text-sm font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:text-accent-fg"
            >
              {entry.name}
            </button>
            {entry.kind === 'template' && <Badge tone="info">{i18n.t('tabs.template')}</Badge>}
            {entry.origin === 'imported' && <Badge>{i18n.t('home.filters.imported')}</Badge>}
            {entry.origin === 'remote' && sourceId === undefined && (
              <Badge>{i18n.t('home.filters.remote')}</Badge>
            )}
            {copy && <Badge>{i18n.t('home.remote.copy')}</Badge>}
            {update && <Badge tone="warning">{i18n.t('home.remote.update')}</Badge>}
          </div>
          <span className="truncate font-mono text-2xs text-fg-subtle">{entry.slug}</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="tabular">{screens}</span>
            <span aria-hidden>·</span>
            <time dateTime={entry.updatedAt} title={formatAbsolute(entry.updatedAt, locale)}>
              {i18n.t('home.card.updated', { date: formatRelative(entry.updatedAt, locale) })}
            </time>
          </span>
        </div>
      </div>
      {sourceId === undefined && (
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={i18n.t('home.card.actions', { name: entry.name })}
              className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md bg-panel text-fg-muted opacity-0 shadow-[0_0_0_1px_var(--line-subtle)] group-hover/card:opacity-100 hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            {update && (
              <>
                <MenuItem icon={<GitCompare size={14} />} onSelect={() => showCompare(entry)}>
                  {i18n.t('home.remote.compare')}
                </MenuItem>
                <MenuItem
                  icon={<Replace size={14} />}
                  onSelect={() => void replaceFromOrigin(entry, i18n)}
                >
                  {i18n.t('home.remote.replace')}
                </MenuItem>
                <MenuSeparator />
              </>
            )}
            <MenuItem
              icon={entry.kind === 'template' ? <Plus size={14} /> : <LayoutTemplate size={14} />}
              onSelect={() =>
                showDerive({
                  path: entry.path,
                  name: entry.name,
                  target: entry.kind === 'template' ? 'journey' : 'template',
                })
              }
            >
              {i18n.t(
                entry.kind === 'template' ? 'home.card.createFrom' : 'home.card.saveAsTemplate',
              )}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              tone="danger"
              icon={<Trash2 size={14} />}
              onSelect={() => void trashEntry(entry)}
            >
              {i18n.t('home.card.delete')}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg bg-panel shadow-[0_0_0_1px_var(--line-subtle)]"
        >
          <Skeleton className="h-[116px] rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
