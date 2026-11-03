import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, EmptyState, Input } from '@rnjb/ui';
import type { ComponentManifest } from '@rnjb/pack-schema';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { useLibraries } from '../services/library-store.ts';
import { useService } from '../services/service-store.ts';
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

export function CatalogPanel({
  onAdd,
}: {
  /** Present when a screen is selected and the document is editable. */
  onAdd?: (item: DraggedComponent) => void;
}) {
  const i18n = useT();
  const startDrag = useCatalogDrag((state) => state.start);
  const endDrag = useCatalogDrag((state) => state.end);
  const status = useService((state) => state.status);
  const sources = useService((state) => state.settings?.librarySources);
  const packs = useLibraries((state) => state.packs);
  const extracting = useLibraries((state) => state.extracting);
  const load = useLibraries((state) => state.load);
  const extract = useLibraries((state) => state.extract);
  const [query, setQuery] = useState('');
  const online = status === 'online';

  useEffect(() => {
    if (online) load().catch((error: unknown) => reportError(error, i18n));
    // i18n is stable per locale; reloading on locale change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, load]);

  const run = async (pkg: string) => {
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
  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <Input
        aria-label={i18n.t('editor.catalog.search')}
        placeholder={i18n.t('editor.catalog.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {packages.map((pkg) => {
        const pack = packs.find((candidate) => candidate.package === pkg);
        const hasSource = sources?.[pkg] !== undefined;
        const visible = (pack?.components ?? []).filter(
          (component) => !needle || component.name.toLowerCase().includes(needle),
        );
        return (
          <section key={pkg} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-mono text-xs font-semibold" title={pkg}>
                {pkg}
              </h3>
              {hasSource && online ? (
                <Button loading={extracting === pkg} onClick={() => void run(pkg)}>
                  {pack ? i18n.t('editor.catalog.reextract') : i18n.t('editor.catalog.extract')}
                </Button>
              ) : (
                !hasSource && (
                  <span className="text-2xs text-fg-subtle">
                    {i18n.t('editor.catalog.noSource')}
                  </span>
                )
              )}
            </div>
            {pack && visible.length === 0 && (
              <p className="text-xs text-fg-subtle">{i18n.t('editor.catalog.noResults')}</p>
            )}
            {groupByCategory(visible).map(([category, components]) => (
              <div key={category} className="flex flex-col">
                <h4 className="py-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
                  {category || i18n.t('editor.catalog.uncategorized')}
                </h4>
                <ul className="flex flex-col">
                  {components.map((component) => (
                    <li
                      key={component.name}
                      className="flex items-center rounded-sm hover:bg-hover"
                    >
                      <button
                        type="button"
                        disabled={!pack || !onAdd}
                        draggable={Boolean(pack && onAdd)}
                        onDragStart={(event) => {
                          const item = { package: pkg, component: component.name };
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData('text/plain', component.name);
                          startDrag(item);
                        }}
                        onDragEnd={endDrag}
                        aria-label={i18n.t('editor.catalog.add', { name: component.name })}
                        onClick={() => onAdd?.({ package: pkg, component: component.name })}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 px-1.5 py-1 text-left text-sm disabled:cursor-default"
                      >
                        <span className="truncate">{component.name}</span>
                        <Badge>
                          {i18n.t('editor.catalog.props', { count: component.props.length })}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
