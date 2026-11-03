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

/**
 * Inspector order: props with a value first, then required ones, then the rest, each group
 * alphabetical. A React Native `Text` has 65 props and the useful ones must not hide behind a
 * dozen `accessibility…` rows.
 */
export function orderPropNames(
  names: readonly string[],
  isSet: (name: string) => boolean,
  isRequired: (name: string) => boolean,
): string[] {
  const rank = (name: string) => (isSet(name) ? 0 : isRequired(name) ? 1 : 2);
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
