import type { TypedParam } from '@rnjb/core';

const PARAM = /^([A-Za-z_$][A-Za-z0-9_$]*)(\?)?\s*:\s*(\S.*)$/;

/** «name: type, other?: type» as typed params. `undefined` when an entry is not that shape. */
export function parseParams(text: string): TypedParam[] | undefined {
  const entries = splitTopLevel(text).filter((entry) => entry.trim() !== '');
  const params: TypedParam[] = [];
  for (const entry of entries) {
    const match = PARAM.exec(entry.trim());
    if (!match) return undefined;
    const name = match[1] as string;
    if (params.some((param) => param.name === name)) return undefined;
    params.push({
      name,
      type: (match[3] as string).trim(),
      ...(match[2] ? { optional: true } : {}),
    });
  }
  return params;
}

export const formatParams = (params: readonly TypedParam[]): string =>
  params.map((param) => `${param.name}${param.optional ? '?' : ''}: ${param.type}`).join(', ');

/** Splits on commas that are not inside <>, (), [] or {} (types such as Record<string, number>). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if ('<([{'.includes(char)) depth += 1;
    else if ('>)]}'.includes(char)) depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}
