import { defaultPropValue, type PropValue, type PropValueType } from '@rnjb/core';
import type { ComponentManifest, LibraryPack } from '@rnjb/pack-schema';

type PropManifest = ComponentManifest['props'][number];

export interface TokenOption {
  group: string;
  name: string;
}

/** Text a value shows, used to carry the content over when its type changes. */
export function seedText(value: PropValue | undefined, strings: Record<string, string>): string {
  switch (value?.type) {
    case undefined:
      return '';
    case 'literal':
      return value.value === null ? '' : String(value.value);
    case 'string':
      return strings[value.key] ?? '';
    case 'token':
      return `${value.group}.${value.name}`;
    case 'icon':
      return value.name;
    case 'binding':
      return value.path;
    case 'expression':
      return value.code;
  }
}

/** Colour and typography tokens of the pack; spacing has its own editor (§11.3). */
export function tokenOptions(pack: LibraryPack | undefined): TokenOption[] {
  const tokens = pack?.tokens;
  if (!tokens) return [];
  return [
    ...Object.keys(tokens.colors ?? {}).map((name) => ({ group: 'colors', name })),
    ...Object.entries(tokens.typography ?? {}).flatMap(([style, group]) =>
      Object.keys(group).map((name) => ({ group: `typography.${style}`, name })),
    ),
  ];
}

/** Types a prop can be switched to. Bindings are created from the data panel, not from here. */
export function convertibleTypes(
  name: string,
  prop: PropManifest | undefined,
  manifest: ComponentManifest | undefined,
  pack: LibraryPack | undefined,
  current: PropValueType,
): PropValueType[] {
  const types: PropValueType[] = ['literal'];
  if (prop?.kind === 'string' || manifest?.editableTextProps?.includes(name)) types.push('string');
  if (tokenOptions(pack).length > 0) types.push('token');
  if (pack?.icons && pack.icons.names.length > 0 && manifest?.iconProps?.includes(name)) {
    types.push('icon');
  }
  types.push('expression');
  return types.filter((type) => type !== current);
}

/**
 * The value a prop takes when switched to `target`, carrying its current text over where it makes
 * sense. `undefined` when the target has nothing to offer (and for `string`, which needs the
 * `convertPropToString` command because it also writes the document's texts).
 */
export function convertedValue(
  target: PropValueType,
  current: PropValue | undefined,
  strings: Record<string, string>,
  prop: PropManifest | undefined,
  componentName: string,
  pack: LibraryPack | undefined,
): PropValue | undefined {
  const text = seedText(current, strings);
  switch (target) {
    case 'literal': {
      const typed =
        prop && prop.kind !== 'string' ? defaultPropValue(prop, componentName) : undefined;
      return typed ?? { type: 'literal', value: text };
    }
    case 'token': {
      const first = tokenOptions(pack)[0];
      return first && { type: 'token', ...first };
    }
    case 'icon': {
      const first = pack?.icons?.names[0];
      return first === undefined ? undefined : { type: 'icon', name: first };
    }
    case 'expression':
      return { type: 'expression', code: JSON.stringify(text) };
    default:
      return undefined;
  }
}
