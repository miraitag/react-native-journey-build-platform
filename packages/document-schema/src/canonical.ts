/**
 * Canonical JSON (ADR 0001): object keys sorted by code point, arrays in order, 2-space indent,
 * trailing newline. `undefined` members are dropped, exactly like `JSON.stringify`.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) sorted[key] = canonicalize(member);
    }
    return sorted;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Non-finite numbers cannot be serialized');
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}
