import type { DocumentComparison } from '@rnjb/core';
import { useT } from '../app/preferences.ts';

/** What differs between two versions of a journey: screens, connections and other sections. */
export function ComparisonSummary({ comparison }: { comparison: DocumentComparison }) {
  const i18n = useT();
  const { screens, connections, sections } = comparison;
  const rows: { label: string; names: string[] }[] = [
    { label: i18n.t('home.remote.screensAdded'), names: screens.added },
    { label: i18n.t('home.remote.screensRemoved'), names: screens.removed },
    { label: i18n.t('home.remote.screensChanged'), names: screens.changed },
  ].filter((row) => row.names.length > 0);

  if (comparison.identical) return <p className="text-sm">{i18n.t('home.remote.sameContent')}</p>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {rows.map((row) => (
        <div key={row.label}>
          <h3 className="text-xs font-medium text-fg-muted">{row.label}</h3>
          <p>{row.names.join(', ')}</p>
        </div>
      ))}
      {connections.added + connections.removed + connections.changed > 0 && (
        <p>
          {i18n.t('home.remote.connections', {
            added: connections.added,
            removed: connections.removed,
            changed: connections.changed,
          })}
        </p>
      )}
      {sections.length > 0 && (
        <p>
          {i18n.t('home.remote.sections', {
            list: sections.map((section) => i18n.t(`home.remote.section.${section}`)).join(', '),
          })}
        </p>
      )}
    </div>
  );
}
