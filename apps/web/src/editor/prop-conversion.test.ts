import { describe, expect, it } from 'vitest';
import type { ComponentManifest, LibraryPack } from '@rnjb/pack-schema';
import { convertedValue, convertibleTypes, seedText, tokenOptions } from './prop-conversion.ts';

const pack = {
  tokens: {
    colors: { primary: '#00f', danger: '#f00' },
    typography: { body: { size: 14 } },
  },
  icons: { component: 'Icon', nameProp: 'name', names: ['home', 'user'] },
} as unknown as LibraryPack;

const manifest = {
  editableTextProps: ['title'],
  iconProps: ['icon'],
} as unknown as ComponentManifest;
const stringProp = { name: 'title', kind: 'string' } as never;
const numberProp = { name: 'size', kind: 'number', optional: true } as never;

describe('seedText', () => {
  it('shows the text of every value type', () => {
    expect(seedText(undefined, {})).toBe('');
    expect(seedText({ type: 'literal', value: 3 }, {})).toBe('3');
    expect(seedText({ type: 'literal', value: null }, {})).toBe('');
    expect(seedText({ type: 'string', key: 'k' }, { k: 'Hola' })).toBe('Hola');
    expect(seedText({ type: 'token', group: 'colors', name: 'primary' }, {})).toBe(
      'colors.primary',
    );
    expect(seedText({ type: 'icon', name: 'home' }, {})).toBe('home');
    expect(seedText({ type: 'binding', source: 'form', path: 'a.b' }, {})).toBe('a.b');
    expect(seedText({ type: 'expression', code: 'x' }, {})).toBe('x');
  });
});

describe('tokenOptions', () => {
  it('lists colours and typography groups, and is empty without tokens', () => {
    expect(tokenOptions(pack)).toEqual([
      { group: 'colors', name: 'primary' },
      { group: 'colors', name: 'danger' },
      { group: 'typography.body', name: 'size' },
    ]);
    expect(tokenOptions(undefined)).toEqual([]);
  });
});

describe('convertibleTypes', () => {
  it('offers only what the prop and pack support, without the current type', () => {
    expect(convertibleTypes('title', stringProp, manifest, pack, 'literal')).toEqual([
      'string',
      'token',
      'expression',
    ]);
    expect(convertibleTypes('icon', undefined, manifest, pack, 'icon')).toEqual([
      'literal',
      'token',
      'expression',
    ]);
    expect(convertibleTypes('size', numberProp, undefined, undefined, 'literal')).toEqual([
      'expression',
    ]);
  });
});

describe('convertedValue', () => {
  it('carries text over and picks the first token or icon', () => {
    const current = { type: 'string', key: 'k' } as const;
    expect(convertedValue('literal', current, { k: 'Hola' }, stringProp, 'Btn', pack)).toEqual({
      type: 'literal',
      value: 'Hola',
    });
    expect(convertedValue('expression', current, { k: 'Hola' }, stringProp, 'Btn', pack)).toEqual({
      type: 'expression',
      code: '"Hola"',
    });
    expect(convertedValue('token', current, {}, stringProp, 'Btn', pack)).toEqual({
      type: 'token',
      group: 'colors',
      name: 'primary',
    });
    expect(convertedValue('icon', current, {}, stringProp, 'Btn', pack)).toEqual({
      type: 'icon',
      name: 'home',
    });
    expect(convertedValue('token', current, {}, stringProp, 'Btn', undefined)).toBeUndefined();
    expect(convertedValue('string', current, {}, stringProp, 'Btn', pack)).toBeUndefined();
  });

  it('uses a typed default for non-text props', () => {
    expect(
      convertedValue('literal', { type: 'expression', code: 'x' }, {}, numberProp, 'Btn', pack),
    ).toEqual({ type: 'literal', value: 0 });
  });
});
