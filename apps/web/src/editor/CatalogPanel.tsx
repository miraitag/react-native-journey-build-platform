import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  Segmented,
} from '@rnjb/ui';
import type { ComponentManifest, LibraryPack } from '@rnjb/pack-schema';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { useLibraries } from '../services/library-store.ts';
import { useService } from '../services/service-store.ts';
import type { LibraryDiff } from '../services/local-service.ts';
import { useCatalogDrag } from './catalog-drag.ts';
import type { DraggedComponent } from './insert-component.ts';

function groupByCategory(components: readonly ComponentManifest[]) {
  const groups = new Map<string, ComponentManifest[]>();
  for (const component of components) {
    const key = component.category ?? '';
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

type CatalogView = 'library' | 'category';

/** A category the team declared in the pack shows its name under its parent's (two levels, §11.3). */
export function categoryLabel(pack: Pick<LibraryPack, 'categories'>, category: string): string {
  const own = pack.categories?.find((candidate) => candidate.id === category);
  if (!own) return category;
  const parent = pack.categories?.find((candidate) => candidate.id === own.parentId);
  return parent ? `${parent.name} / ${own.name}` : own.name;
}

export function CatalogPanel({
  libraries,
  onAdd,
}: {
  /** Libraries of the open document: a version other than the catalog's is flagged (§11.3). */
  libraries?: readonly { package: string; version: string }[];
  /** Present when a screen is selected and the document is editable. */
  onAdd?: (item: DraggedComponent) => void;
}) {
  const i18n = useT();
  const startDrag = useCatalogDrag((state) => state.start);
  const endDrag = useCatalogDrag((state) => state.end);
  const status = useService((state) => state.status);
  const sources = useService((state) => state.settings?.librarySources);
  const packs = useLibraries((state) => state.packs);
  const loading = useLibraries((state) => state.loading);
  const extracting = useLibraries((state) => state.extracting);
  const load = useLibraries((state) => state.load);
  const extract = useLibraries((state) => state.extract);
  const review = useLibraries((state) => state.review);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<CatalogView>('library');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<{ pkg: string; diff: LibraryDiff }>();
  const online = status === 'online';

  useEffect(() => {
    if (online) load().catch((error: unknown) => reportError(error, i18n));
    // i18n is stable per locale; reloading on locale change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, load]);

  /** A re-extraction that changes the manifest is reviewed first; nothing is written until accepted. */
  const run = async (pkg: string) => {
    try {
      if (packs.some((pack) => pack.package === pkg)) {
        const diff = await review(pkg);
        if (changeCount(diff) > 0) return setPending({ pkg, diff });
      }
      await apply(pkg);
    } catch (error) {
      reportError(error, i18n);
    }
  };

  const apply = async (pkg: string) => {
    try {
      const diff = await extract(pkg);
      const pack = useLibraries.getState().packs.find((candidate) => candidate.package === pkg);
      toast.success(
        i18n.t('editor.catalog.extracted', { package: pkg, count: pack?.components.length ?? 0 }),
        {
          description: i18n.t('editor.catalog.diffSummary', {
            added: diff.addedComponents.length,
            removed: diff.removedComponents.length,
            changed: diff.changedComponents.length,
          }),
        },
      );
    } catch (error) {
      reportError(error, i18n);
    }
  };

  const packages = useMemo(() => {
    const names = new Set([...Object.keys(sources ?? {}), ...packs.map((pack) => pack.package)]);
    return [...names].sort();
  }, [sources, packs]);

  if (packages.length === 0) {
    return (
      <EmptyState title={i18n.t('editor.catalog.emptyTitle')}>
        {online ? i18n.t('editor.catalog.emptyBody') : i18n.t('editor.catalog.needsService')}
      </EmptyState>
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = (pack: LibraryPack | undefined) =>
    (pack?.components ?? []).filter(
      (component) => !needle || component.name.toLowerCase().includes(needle),
    );

  const rows = (pack: LibraryPack, components: readonly ComponentManifest[]) => (
    <ul className="flex flex-col">
      {components.map((component) => {
        const key = `${pack.package}/${component.name}`;
        const variantProp = component.props.find(
          (prop) => prop.name === component.variantProps?.[0] && prop.options?.length,
        );
        const open = expanded.has(key);
        const row = (variant?: DraggedComponent['variant']) => {
          const item = { package: pack.package, component: component.name, variant };
          return (
            <button
              type="button"
              disabled={!onAdd}
              draggable={Boolean(onAdd)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('text/plain', component.name);
                startDrag(item);
              }}
              onDragEnd={endDrag}
              title={`${pack.package}@${pack.packageVersion}`}
              aria-label={
                variant
                  ? i18n.t('editor.catalog.addVariant', {
                      name: component.name,
                      variant: String(variant.value),
                    })
                  : i18n.t('editor.catalog.add', { name: component.name })
              }
              onClick={() => onAdd?.(item)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1.5 py-1 text-left text-sm disabled:cursor-default"
            >
              {variant ? (
                <span className="truncate pl-5 font-mono text-xs text-fg-muted">
                  {variant.prop}: {String(variant.value)}
                </span>
              ) : (
                <>
                  <span className="truncate">{component.name}</span>
                  <Badge>{i18n.t('editor.catalog.props', { count: component.props.length })}</Badge>
                </>
              )}
            </button>
          );
        };
        return (
          <li key={key} className="[contain-intrinsic-size:auto_28px] [content-visibility:auto]">
            <div className="flex items-center rounded-sm hover:bg-hover">
              {variantProp && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={i18n.t('editor.catalog.variants', { name: component.name })}
                  onClick={() =>
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      if (!next.delete(key)) next.add(key);
                      return next;
                    })
                  }
                  className="flex size-6 shrink-0 items-center justify-center text-fg-subtle hover:text-fg"
                >
                  <ChevronRight
                    size={12}
                    aria-hidden
                    className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
                  />
                </button>
              )}
              {row()}
            </div>
            {open && variantProp && (
              <ul className="flex flex-col">
                {(variantProp.options ?? []).map((value) => (
                  <li key={String(value)} className="flex items-center rounded-sm hover:bg-hover">
                    {row({ prop: variantProp.name, value })}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  const heading = (text: string) => (
    <h4 className="py-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{text}</h4>
  );

  const byCategory = new Map<string, { pack: LibraryPack; components: ComponentManifest[] }[]>();
  if (view === 'category') {
    for (const pack of packs) {
      for (const [category, components] of groupByCategory(shown(pack))) {
        const label = categoryLabel(pack, category) || i18n.t('editor.catalog.uncategorized');
        byCategory.set(label, [...(byCategory.get(label) ?? []), { pack, components }]);
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <ManifestReview
        pending={pending}
        onClose={() => setPending(undefined)}
        onAccept={(pkg) => {
          setPending(undefined);
          void apply(pkg);
        }}
      />
      <Input
        aria-label={i18n.t('editor.catalog.search')}
        placeholder={i18n.t('editor.catalog.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {packs.length > 0 && (
        <div className="flex">
          <Segmented<CatalogView>
            label={i18n.t('editor.catalog.viewLabel')}
            value={view}
            onValueChange={setView}
            options={[
              { value: 'library', label: i18n.t('editor.catalog.byLibrary') },
              { value: 'category', label: i18n.t('editor.catalog.byCategory') },
            ]}
          />
        </div>
      )}
      {view === 'category' &&
        (byCategory.size === 0 ? (
          <p className="text-xs text-fg-subtle">{i18n.t('editor.catalog.noResults')}</p>
        ) : (
          [...byCategory.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, groups]) => (
              <section key={label} className="flex flex-col">
                {heading(label)}
                {groups.map(({ pack, components }) => (
                  <div key={pack.package}>{rows(pack, components)}</div>
                ))}
              </section>
            ))
        ))}
      {view === 'library' &&
        packages.map((pkg) => {
          const pack = packs.find((candidate) => candidate.package === pkg);
          const hasSource = sources?.[pkg] !== undefined;
          const visible = shown(pack);
          const used = libraries?.find((library) => library.package === pkg)?.version;
          const mismatch = pack && used !== undefined && used !== pack.packageVersion;
          return (
            <section key={pkg} className="flex flex-col gap-1">
              <div className="flex min-h-7 items-center gap-1.5">
                <h3 className="min-w-0 truncate font-mono text-xs font-semibold" title={pkg}>
                  {pkg}
                </h3>
                {pack && (
                  <Badge tone={mismatch ? 'warning' : 'neutral'} className="font-mono">
                    {mismatch && <AlertTriangle size={10} aria-hidden />}
                    {pack.packageVersion}
                  </Badge>
                )}
                {pack && hasSource && online && (
                  <IconButton
                    className="ml-auto"
                    label={i18n.t('editor.catalog.reextract')}
                    icon={
                      <RefreshCw
                        size={13}
                        className={
                          extracting === pkg ? 'animate-spin motion-reduce:animate-none' : undefined
                        }
                      />
                    }
                    disabled={extracting === pkg}
                    onClick={() => void run(pkg)}
                  />
                )}
              </div>
              {mismatch && (
                <p className="text-2xs text-warning-fg">
                  {i18n.t('editor.catalog.versionMismatch', {
                    version: used,
                    catalog: pack.packageVersion,
                  })}
                </p>
              )}
              {!pack && hasSource && online && !loading && (
                <Button loading={extracting === pkg} onClick={() => void run(pkg)}>
                  {i18n.t('editor.catalog.extract')}
                </Button>
              )}
              {!hasSource && (
                <p className="text-2xs text-fg-subtle">{i18n.t('editor.catalog.noSource')}</p>
              )}
              {pack && visible.length === 0 && (
                <p className="text-xs text-fg-subtle">{i18n.t('editor.catalog.noResults')}</p>
              )}
              {pack &&
                groupByCategory(visible).map(([category, components]) => (
                  <div key={category} className="flex flex-col">
                    {heading(
                      categoryLabel(pack, category) || i18n.t('editor.catalog.uncategorized'),
                    )}
                    {rows(pack, components)}
                  </div>
                ))}
            </section>
          );
        })}
    </div>
  );
}

const changeCount = (diff: LibraryDiff) =>
  diff.addedComponents.length + diff.removedComponents.length + diff.changedComponents.length;

/** Review of what a new version of the library changes in its manifest (§7.2). */
function ManifestReview({
  pending,
  onClose,
  onAccept,
}: {
  pending: { pkg: string; diff: LibraryDiff } | undefined;
  onClose: () => void;
  onAccept: (pkg: string) => void;
}) {
  const i18n = useT();
  const diff = pending?.diff;
  const list = (title: string, names: readonly string[]) =>
    names.length > 0 && (
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold">{title}</h3>
        <ul className="font-mono text-xs">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
    );
  return (
    <Dialog open={pending !== undefined} onOpenChange={(open) => !open && onClose()}>
      {pending && diff && (
        <DialogContent
          title={i18n.t('editor.catalog.reviewTitle', { package: pending.pkg })}
          description={i18n.t('editor.catalog.reviewBody')}
          closeLabel={i18n.t('common.close')}
          width={480}
        >
          <div className="flex max-h-80 flex-col gap-3 overflow-auto">
            {list(i18n.t('editor.catalog.reviewAdded'), diff.addedComponents)}
            {list(i18n.t('editor.catalog.reviewRemoved'), diff.removedComponents)}
            {list(
              i18n.t('editor.catalog.reviewChanged'),
              diff.changedComponents.map((change) =>
                [
                  change.name,
                  ...change.addedProps.map((prop) => `+${prop}`),
                  ...change.removedProps.map((prop) => `−${prop}`),
                  ...change.changedProps.map((prop) => `~${prop}`),
                ].join(' '),
              ),
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {i18n.t('editor.catalog.reviewReject')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => onAccept(pending.pkg)}>
              {i18n.t('editor.catalog.reviewAccept')}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
