import type { Form, FormField, RnjbDocument, Screen } from '@rnjb/core';
import type { LibraryPack } from '@rnjb/pack-schema';

/** Fallback when the field has no message of its own. */
export type FallbackMessage = string;

const messageOf = (
  field: FormField,
  strings: RnjbDocument['strings'],
  fallback: string,
): string => {
  const first = Object.values(field.messages)[0];
  return (first && strings[first]) || fallback;
};

const cache = new WeakMap<Screen, { key: string; screen: Screen }>();

/**
 * Preview-only (§14.1): shows the error state of the fields the user chose to simulate by
 * setting the component's error prop (from the pack's `formBinding.error`) to the field message.
 * The document is never changed. Returns the same screen when nothing applies so memoized
 * consumers do not re-render.
 */
export function withSimulatedErrors(
  screen: Screen,
  forms: readonly Form[],
  simulated: Readonly<Record<string, true>>,
  libraries: readonly LibraryPack[],
  strings: RnjbDocument['strings'],
  fallback: FallbackMessage,
): Screen {
  const overrides: [string, string, string][] = [];
  for (const form of forms) {
    if (form.screenId !== screen.id) continue;
    for (const field of form.fields) {
      if (!simulated[field.id] || !field.nodeId) continue;
      const node = screen.nodes[field.nodeId];
      if (node?.kind !== 'component') continue;
      const manifest = libraries
        .find((pack) => pack.package === node.ref.package)
        ?.components.find((component) => component.name === node.ref.component);
      const prop = manifest?.formBinding?.error;
      if (prop) overrides.push([node.id, prop, messageOf(field, strings, fallback)]);
    }
  }
  if (overrides.length === 0) return screen;

  const key = JSON.stringify(overrides);
  const cached = cache.get(screen);
  if (cached?.key === key) return cached.screen;

  const nodes = { ...screen.nodes };
  for (const [nodeId, prop, text] of overrides) {
    const node = nodes[nodeId];
    if (node?.kind !== 'component') continue;
    nodes[nodeId] = { ...node, props: { ...node.props, [prop]: { type: 'literal', value: text } } };
  }
  const result = { ...screen, nodes };
  cache.set(screen, { key, screen: result });
  return result;
}
