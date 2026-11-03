import { RnjbError, formatFieldPath, type RnjbDocument } from '@rnjb/core';
import { canonicalStringify } from './canonical.ts';
import { computeIntegrity } from './integrity.ts';
import { MIGRATIONS, migrate, type Migration } from './migrations.ts';
import { FORMAT_VERSION, documentSchema, envelopeSchema } from './schema.ts';

export type OpenMode = 'edit' | 'recovery';

export type OpenResult =
  | { ok: true; mode: OpenMode; document: RnjbDocument; issues: RnjbError[]; migratedFrom?: number }
  | { ok: false; error: RnjbError };

export interface OpenOptions {
  migrations?: Readonly<Record<number, Migration>>;
  formatVersion?: number;
}

/**
 * Opens a `.rnjb` text (§8): envelope → newer-version check → migrations → Zod → checksum.
 * Newer files and checksum mismatches open read-only in recovery mode.
 */
export async function openRnjb(text: string, options: OpenOptions = {}): Promise<OpenResult> {
  const currentVersion = options.formatVersion ?? FORMAT_VERSION;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { ok: false, error: new RnjbError('RNJB-205', {}, { cause }) };
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, error: new RnjbError('RNJB-205') };

  const issues: RnjbError[] = [];
  const fileVersion = envelope.data.formatVersion;
  let mode: OpenMode = 'edit';
  let candidate = raw as Record<string, unknown>;

  if (fileVersion > currentVersion) {
    mode = 'recovery';
    issues.push(new RnjbError('RNJB-202', { fileVersion, platformVersion: currentVersion }));
  } else if (fileVersion < currentVersion) {
    candidate = migrate(candidate, fileVersion, currentVersion, options.migrations ?? MIGRATIONS);
  }

  const parsed = documentSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: new RnjbError('RNJB-201', {
        path: formatFieldPath(first?.path ?? []),
        detail: first?.message ?? '',
        count: parsed.error.issues.length,
      }),
    };
  }

  const document = parsed.data;
  // A migrated file gets a fresh checksum when saved; only unmigrated files are verified.
  if (fileVersion === currentVersion && document.integrity !== (await computeIntegrity(document))) {
    mode = 'recovery';
    issues.push(new RnjbError('RNJB-203'));
  }

  return {
    ok: true,
    mode,
    document,
    issues,
    ...(fileVersion < currentVersion ? { migratedFrom: fileVersion } : {}),
  };
}

/** The `.rnjb` text and the integrity it carries, hashed once. */
export async function serializeRnjbWithIntegrity(
  document: RnjbDocument,
): Promise<{ text: string; integrity: string }> {
  const integrity = await computeIntegrity(document);
  return { text: canonicalStringify({ ...document, integrity }), integrity };
}

/** Serializes deterministically with a fresh `integrity` (§8, principle 7). */
export async function serializeRnjb(document: RnjbDocument): Promise<string> {
  return (await serializeRnjbWithIntegrity(document)).text;
}
