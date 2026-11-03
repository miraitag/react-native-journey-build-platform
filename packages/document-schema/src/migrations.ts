/** A migration upgrades a raw document from `formatVersion` n to n + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations keyed by the version they upgrade from. Format 1 is the first public
 * format, so the registry is empty; the next format change adds `1: (raw) => ...`.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function migrate(
  raw: Record<string, unknown>,
  from: number,
  to: number,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  let current = raw;
  for (let version = from; version < to; version += 1) {
    const step = migrations[version];
    if (!step) throw new Error(`Missing migration from formatVersion ${version}`);
    current = { ...step(current), formatVersion: version + 1 };
  }
  return current;
}
