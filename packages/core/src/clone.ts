import type { RnjbDocument, DocumentKind } from './entities.ts';
import type { ClockPort, IdPort } from './ports.ts';

export interface CloneDocumentInput {
  kind: DocumentKind;
  name: string;
  slug: string;
}

/** Top-level parts whose ids are internal to the journey. Profile, libraries and meta are not. */
const ID_PARTS = [
  'screens',
  'connections',
  'forms',
  'data',
  'assets',
  'categories',
  'board',
] as const;

function collectIds(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, into);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') into.add(record.id);
    for (const item of Object.values(record)) collectIds(item, into);
  }
}

function remap(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remap(item, map));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[map.get(key) ?? key] = remap(item, map);
    return result;
  }
  return value;
}

/**
 * Copies a document as a new journey or template (§19.2): every id is replaced, so the copy shares
 * nothing with the original, and `provenance` is dropped. References between ids (connections,
 * forms, board positions, children) follow the new ids. `integrity` is left empty for the
 * serializer to fill.
 */
export function cloneDocument(
  source: RnjbDocument,
  input: CloneDocumentInput,
  context: { ids: IdPort; clock: ClockPort },
): RnjbDocument {
  const found = new Set<string>();
  for (const part of ID_PARTS) collectIds(source[part], found);
  const map = new Map<string, string>();
  for (const id of found) map.set(id, context.ids.next());

  const now = context.clock.now();
  const copy: RnjbDocument = {
    ...(JSON.parse(JSON.stringify(source)) as RnjbDocument),
    meta: {
      ...source.meta,
      kind: input.kind,
      name: input.name,
      slug: input.slug,
      createdAt: now,
      updatedAt: now,
    },
    integrity: '',
  };
  delete copy.provenance;
  const target = copy as unknown as Record<string, unknown>;
  for (const part of ID_PARTS) target[part] = remap(source[part], map);
  return copy;
}
