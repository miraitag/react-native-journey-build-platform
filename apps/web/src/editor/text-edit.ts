import type { DocumentNode } from '@rnjb/core';

/** Props that normally carry a component's visible text, in order of preference. */
const TEXT_PROPS = ['children', 'title', 'label', 'text'];

/**
 * The prop holding the text a component node shows, if any, and its current text. A document
 * string (any prop) or a string literal in a text-like prop can be edited in place; bindings,
 * expressions and other literals are edited in the inspector.
 */
export function textPropOf(
  node: DocumentNode | undefined,
  strings: Record<string, string>,
): { name: string; text: string } | undefined {
  if (node?.kind !== 'component') return undefined;
  const names = [
    ...TEXT_PROPS.filter((name) => name in node.props),
    ...Object.keys(node.props).filter((name) => !TEXT_PROPS.includes(name)),
  ];
  for (const name of names) {
    const value = node.props[name];
    if (value?.type === 'string') return { name, text: strings[value.key] ?? '' };
    if (value?.type === 'literal' && typeof value.value === 'string' && TEXT_PROPS.includes(name)) {
      return { name, text: value.value };
    }
  }
  return undefined;
}
