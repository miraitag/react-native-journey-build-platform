import type { PropValue } from '@rnjb/core';

/**
 * Parses what the user typed into a literal for a prop of `kind`.
 * `undefined` means "not a valid value": the caller keeps the previous one.
 */
export function parseLiteralInput(
  kind: string,
  text: string,
): Extract<PropValue, { type: 'literal' }> | undefined {
  if (kind === 'number') {
    const trimmed = text.trim();
    const value = Number(trimmed);
    return trimmed !== '' && Number.isFinite(value) ? { type: 'literal', value } : undefined;
  }
  return { type: 'literal', value: text };
}

/** Text shown in the editor of a literal. */
export const literalToInput = (value: Extract<PropValue, { type: 'literal' }>): string =>
  value.value === null ? '' : String(value.value);
