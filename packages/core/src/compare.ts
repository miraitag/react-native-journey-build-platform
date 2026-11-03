import type { RnjbDocument } from './entities.ts';

export type ComparedSection =
  'name' | 'profile' | 'libraries' | 'forms' | 'data' | 'strings' | 'assets' | 'categories';

export interface DocumentComparison {
  /** Screen names; screens are matched by id. */
  screens: { added: string[]; removed: string[]; changed: string[] };
  connections: { added: number; removed: number; changed: number };
  sections: ComparedSection[];
  identical: boolean;
}

/** Key order must not matter: the same document can come from files written by different tools. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * What differs between a local copy and its origin (§6.4 «Comparar»). Board positions,
 * timestamps and provenance are not content, so they never count as a difference.
 */
export function compareDocuments(local: RnjbDocument, remote: RnjbDocument): DocumentComparison {
  const localScreens = new Map(local.screens.map((screen) => [screen.id, screen]));
  const remoteScreens = new Map(remote.screens.map((screen) => [screen.id, screen]));
  const screens = {
    added: remote.screens.filter((screen) => !localScreens.has(screen.id)).map((s) => s.name),
    removed: local.screens.filter((screen) => !remoteScreens.has(screen.id)).map((s) => s.name),
    changed: remote.screens
      .filter((screen) => {
        const mine = localScreens.get(screen.id);
        return mine !== undefined && stable(mine) !== stable(screen);
      })
      .map((screen) => screen.name),
  };

  const localConnections = new Map(local.connections.map((item) => [item.id, item]));
  const remoteConnections = new Map(remote.connections.map((item) => [item.id, item]));
  const connections = {
    added: remote.connections.filter((item) => !localConnections.has(item.id)).length,
    removed: local.connections.filter((item) => !remoteConnections.has(item.id)).length,
    changed: remote.connections.filter((item) => {
      const mine = localConnections.get(item.id);
      return mine !== undefined && stable(mine) !== stable(item);
    }).length,
  };

  const candidates: [ComparedSection, unknown, unknown][] = [
    ['name', local.meta.name, remote.meta.name],
    ['profile', local.profile, remote.profile],
    ['libraries', local.libraries, remote.libraries],
    ['forms', local.forms, remote.forms],
    ['data', local.data, remote.data],
    ['strings', local.strings, remote.strings],
    ['assets', local.assets, remote.assets],
    ['categories', local.categories, remote.categories],
  ];
  const sections = candidates
    .filter(([, mine, theirs]) => stable(mine) !== stable(theirs))
    .map(([section]) => section);

  const identical =
    sections.length === 0 &&
    screens.added.length + screens.removed.length + screens.changed.length === 0 &&
    connections.added + connections.removed + connections.changed === 0;
  return { screens, connections, sections, identical };
}
