import { deriveNames } from '@rnjb/core';
import { describe, expect, it } from 'vitest';
import { defaultProfile, profilePrefixes, withBuiltInCuration } from './index.ts';

describe('default profile', () => {
  it('derives the names of plan §9.2', () => {
    const names = deriveNames('order-tracking', defaultProfile.conventions.nameTemplates);
    expect(names.package).toBe('react-native-order-tracking');
    expect(names.navigator).toBe('OrderTrackingNavigator');
  });

  it('exposes the prefixes to strip from typed slugs', () => {
    expect(profilePrefixes(defaultProfile)).toContain('react-native-');
  });
});

describe('built-in curation (§7.3)', () => {
  const extracted = (name: string) => ({
    name,
    origin: 'extracted' as const,
    props: [],
    nesting: { acceptsChildren: true },
  });

  it('marks react-native leaves and leaves other packages alone', () => {
    const [input, text, view] = withBuiltInCuration('react-native', [
      extracted('TextInput'),
      extracted('Text'),
      extracted('View'),
    ]);
    expect(input).toMatchObject({
      nesting: { acceptsChildren: false },
      formBinding: { value: 'value', onChange: 'onChangeText' },
    });
    expect(text?.nesting).toEqual({ acceptsChildren: true, allowedChildren: ['Text'] });
    expect(view?.nesting).toEqual({ acceptsChildren: true });
    expect(withBuiltInCuration('@acme/ui', [extracted('TextInput')])[0]?.nesting).toEqual({
      acceptsChildren: true,
    });
  });
});
