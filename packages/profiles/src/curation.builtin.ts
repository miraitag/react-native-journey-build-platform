import type { ComponentManifest } from '@rnjb/pack-schema';

type Curation = Pick<ComponentManifest, 'nesting' | 'editableTextProps' | 'formBinding'>;

const LEAF: Curation = { nesting: { acceptsChildren: false } };

/**
 * What the React Native documentation says about its own primitives and the types cannot tell
 * (§7.3): `TextInputProps` inherits `children` from `ViewProps`, yet a text input takes none.
 * Applied to every extraction of these packages, under whatever the team curates (§7.2).
 */
export const BUILT_IN_CURATION: Readonly<Record<string, Readonly<Record<string, Curation>>>> = {
  'react-native': {
    ActivityIndicator: LEAF,
    Button: { ...LEAF, editableTextProps: ['title'] },
    FlatList: LEAF,
    Image: LEAF,
    ProgressBarAndroid: LEAF,
    RefreshControl: LEAF,
    SectionList: LEAF,
    StatusBar: LEAF,
    Switch: { ...LEAF, formBinding: { value: 'value', onChange: 'onValueChange' } },
    Text: {
      nesting: { acceptsChildren: true, allowedChildren: ['Text'] },
      editableTextProps: ['children'],
    },
    TextInput: {
      ...LEAF,
      editableTextProps: ['placeholder'],
      formBinding: { value: 'value', onChange: 'onChangeText', onBlur: 'onBlur' },
    },
  },
};

/** Extracted components with the built-in curation of their package on top. */
export const withBuiltInCuration = (
  pkg: string,
  components: readonly ComponentManifest[],
): ComponentManifest[] =>
  components.map((component) => ({ ...component, ...BUILT_IN_CURATION[pkg]?.[component.name] }));
