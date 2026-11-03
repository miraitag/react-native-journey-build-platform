import { describe, expect, it } from 'vitest';
import {
  deriveNames,
  normalizeSlug,
  slugPrefixesFromTemplates,
  toCamelCase,
  toPascalCase,
} from './naming.ts';

const templates = {
  folder: 'react-native-acme-{slug}',
  package: '@acme/react-native-acme-{slug}',
  component: '{Pascal}',
  navigator: '{Pascal}Navigator',
  context: '{Pascal}Context',
  params: '{Pascal}Params',
  file: 'journeys/{slug}/{slug}.rnjb',
};

describe('normalizeSlug', () => {
  it.each(['order-tracking', 'abc', 'a1-b2', 'step-2-confirm'])('accepts %s', (slug) => {
    const result = normalizeSlug(slug);
    expect(result.ok && result.value.slug).toBe(slug);
  });

  it.each(['ab', 'Loss-tool', '1abc', 'abc-', 'abc--def', 'abc_def', 'a'.repeat(51), '-abc'])(
    'rejects %s with RNJB-001',
    (slug) => {
      const result = normalizeSlug(slug);
      expect(!result.ok && result.error.code).toBe('RNJB-001');
    },
  );

  it('rejects slugs already used in the workspace', () => {
    const result = normalizeSlug('transfers', { existing: ['payments', 'transfers'] });
    expect(!result.ok && result.error.code).toBe('RNJB-002');
  });

  it('strips a profile prefix and warns', () => {
    const prefixes = slugPrefixesFromTemplates(Object.values(templates));
    const result = normalizeSlug('react-native-acme-order-tracking', { prefixes });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe('order-tracking');
    expect(result.value.warnings.map((warning) => warning.code)).toEqual(['RNJB-003']);
  });

  it('strips the scoped package prefix too', () => {
    const prefixes = slugPrefixesFromTemplates(Object.values(templates));
    const result = normalizeSlug('@acme/react-native-acme-cards', {
      prefixes,
    });
    expect(result.ok && result.value.slug).toBe('cards');
  });
});

describe('derived names', () => {
  it('derives every template of the default profile (§9.2)', () => {
    expect(deriveNames('order-tracking', templates)).toEqual({
      folder: 'react-native-acme-order-tracking',
      package: '@acme/react-native-acme-order-tracking',
      component: 'OrderTracking',
      navigator: 'OrderTrackingNavigator',
      context: 'OrderTrackingContext',
      params: 'OrderTrackingParams',
      file: 'journeys/order-tracking/order-tracking.rnjb',
    });
  });

  it('handles digits in segments', () => {
    expect(toPascalCase('step-2-confirm')).toBe('Step2Confirm');
    expect(toCamelCase('step-2-confirm')).toBe('step2Confirm');
  });
});
