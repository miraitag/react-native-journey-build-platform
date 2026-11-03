import { ERROR_CATALOG } from '@rnjb/core';
import { describe, expect, it } from 'vitest';
import { createTranslator, dictionaries } from './index.ts';

describe('i18n', () => {
  it('has a message and an action for every error code in both locales', () => {
    for (const locale of ['es', 'en'] as const) {
      for (const code of Object.keys(ERROR_CATALOG) as (keyof typeof ERROR_CATALOG)[]) {
        expect(dictionaries[locale].errors[code]?.message, `${locale} ${code}`).toBeTruthy();
        expect(dictionaries[locale].errors[code]?.action, `${locale} ${code}`).toBeTruthy();
      }
    }
  });

  it('interpolates params', () => {
    const { t, error } = createTranslator('es');
    expect(t('home.card.screens', { count: 4 })).toBe('4 pantallas');
    expect(error('RNJB-002', { slug: 'pagos' }).message).toBe(
      'Ya existe un journey con el slug «pagos».',
    );
  });
});
