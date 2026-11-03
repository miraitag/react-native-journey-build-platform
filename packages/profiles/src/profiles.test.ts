import { deriveNames } from '@rnjb/core';
import { describe, expect, it } from 'vitest';
import { defaultProfile, profilePrefixes } from './index.ts';

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
