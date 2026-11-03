export type Severity = 'error' | 'warning' | 'info';

/**
 * Typed error catalog (plan §10.5). Texts live in `@rnjb/i18n` under
 * `errors.<code>.message` and `errors.<code>.action`; the domain only knows codes.
 */
export const ERROR_CATALOG = {
  // Naming
  'RNJB-001': { severity: 'error' }, // slug format
  'RNJB-002': { severity: 'error' }, // slug already used in workspace
  'RNJB-003': { severity: 'warning' }, // slug prefix stripped
  'RNJB-010': { severity: 'error' }, // category deeper than 2 levels
  'RNJB-011': { severity: 'error' }, // category parent missing
  // Library sources (§6.3)
  'RNJB-101': { severity: 'error' }, // source cannot be resolved
  'RNJB-102': { severity: 'error' }, // package name mismatch
  'RNJB-103': { severity: 'error' }, // version out of team range
  'RNJB-104': { severity: 'error' }, // entry point missing
  'RNJB-105': { severity: 'error' }, // URL scheme not allowed
  'RNJB-106': { severity: 'error' }, // library could not be compiled for the web preview
  'RNJB-107': { severity: 'error' }, // remote URL not understood
  'RNJB-108': { severity: 'error' }, // remote source could not be synchronized
  'RNJB-109': { severity: 'error' }, // URL carries a password or token
  // Document (§8)
  'RNJB-201': { severity: 'error' }, // schema invalid
  'RNJB-202': { severity: 'warning' }, // newer formatVersion → read-only recovery
  'RNJB-203': { severity: 'warning' }, // checksum mismatch → read-only recovery
  'RNJB-204': { severity: 'warning' }, // library unresolved → placeholders
  'RNJB-205': { severity: 'error' }, // not a .rnjb file
  'RNJB-206': { severity: 'error' }, // asset path escapes assets/
  'RNJB-207': { severity: 'error' }, // file could not be written (permission, handle lost)
  'RNJB-208': { severity: 'error' }, // file changed on disk after it was read; not overwritten
  // Packs (§7)
  'RNJB-301': { severity: 'error' }, // pack invalid
  'RNJB-302': { severity: 'error' }, // pack not found
  'RNJB-303': { severity: 'error' }, // team config invalid
  // Local service (§6.6, §6.7)
  'RNJB-401': { severity: 'warning' }, // service unavailable
  'RNJB-402': { severity: 'error' }, // unauthorized / origin rejected
  'RNJB-403': { severity: 'error' }, // path outside allowed roots
  'RNJB-404': { severity: 'error' }, // file not found
  'RNJB-405': { severity: 'error' }, // settings invalid
  // Workspace (§6.1)
  'RNJB-501': { severity: 'warning' }, // workspace not configured
  'RNJB-502': { severity: 'error' }, // package.json invalid on import
  // Editing (§9)
  'RNJB-601': { severity: 'error' }, // node not found
  'RNJB-602': { severity: 'error' }, // screen not found
  'RNJB-603': { severity: 'error' }, // operation would create a cycle
  'RNJB-604': { severity: 'error' }, // cannot remove root node
  'RNJB-605': { severity: 'warning' }, // trash item already back in the document
  'RNJB-606': { severity: 'error' }, // screen state name invalid or already used
  'RNJB-607': { severity: 'error' }, // connection not found
  'RNJB-608': { severity: 'error' }, // form, field, model or gateway method not found
  'RNJB-609': { severity: 'error' }, // form/data name or value invalid or already used
} as const satisfies Record<string, { severity: Severity }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export type ErrorParams = Record<string, string | number>;

export class RnjbError extends Error {
  readonly code: ErrorCode;
  readonly severity: Severity;
  readonly params: ErrorParams;

  constructor(code: ErrorCode, params: ErrorParams = {}, options?: { cause?: unknown }) {
    super(`${code}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`, options);
    this.name = 'RnjbError';
    this.code = code;
    this.severity = ERROR_CATALOG[code].severity;
    this.params = params;
  }

  toJSON(): SerializedRnjbError {
    return { code: this.code, severity: this.severity, params: this.params };
  }
}

export interface SerializedRnjbError {
  code: ErrorCode;
  severity: Severity;
  params: ErrorParams;
}

export const isRnjbError = (value: unknown): value is RnjbError => value instanceof RnjbError;

export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERROR_CATALOG, value);

export type Result<T, E = RnjbError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Formats a validation path as `libraries[2].version` so the user can find the exact field. */
export function formatFieldPath(path: readonly PropertyKey[]): string {
  let result = '';
  for (const segment of path) {
    if (typeof segment === 'number') result += `[${segment}]`;
    else if (typeof segment === 'string' && /^[A-Za-z_$][\w$]*$/.test(segment))
      result += result ? `.${segment}` : segment;
    else result += `[${JSON.stringify(String(segment))}]`;
  }
  return result || '(root)';
}
