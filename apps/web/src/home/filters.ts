import type { WorkspaceEntry } from '@rnjb/core';

/** Home filters besides origin and text (§19.1); `''` means any. */
export interface EntryFilters {
  library: string;
  profile: string;
  /** Modified within this many days; 0 means any date. */
  days: number;
}

export const NO_FILTERS: EntryFilters = { library: '', profile: '', days: 0 };

const DAY_MS = 86_400_000;

export function matchesFilters(entry: WorkspaceEntry, filters: EntryFilters, now: number): boolean {
  return (
    (!filters.library || entry.libraries.includes(filters.library)) &&
    (!filters.profile || entry.profile.id === filters.profile) &&
    (!filters.days || now - Date.parse(entry.updatedAt) <= filters.days * DAY_MS)
  );
}

/** Values to offer in each filter: only what the indexed entries actually use. */
export function filterOptions(entries: readonly WorkspaceEntry[]) {
  return {
    libraries: [...new Set(entries.flatMap((entry) => entry.libraries))].sort(),
    profiles: [...new Set(entries.map((entry) => entry.profile.id))].sort(),
  };
}
