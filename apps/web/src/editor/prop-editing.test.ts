import { describe, expect, it } from 'vitest';
import { literalToInput, orderPropNames, parseLiteralInput } from './prop-editing.ts';

describe('parseLiteralInput', () => {
  it('parses numbers and rejects what is not one', () => {
    expect(parseLiteralInput('number', ' 16 ')).toEqual({ type: 'literal', value: 16 });
    expect(parseLiteralInput('number', '-2.5')).toEqual({ type: 'literal', value: -2.5 });
    expect(parseLiteralInput('number', '')).toBeUndefined();
    expect(parseLiteralInput('number', 'abc')).toBeUndefined();
    expect(parseLiteralInput('number', 'Infinity')).toBeUndefined();
  });

  it('keeps text as typed for the other kinds', () => {
    expect(parseLiteralInput('string', ' hola ')).toEqual({ type: 'literal', value: ' hola ' });
    expect(parseLiteralInput('unknown', '')).toEqual({ type: 'literal', value: '' });
  });
});

describe('literalToInput', () => {
  it('shows null as empty and the rest as text', () => {
    expect(literalToInput({ type: 'literal', value: null })).toBe('');
    expect(literalToInput({ type: 'literal', value: 3 })).toBe('3');
    expect(literalToInput({ type: 'literal', value: false })).toBe('false');
  });
});

describe('orderPropNames', () => {
  it('puts set props first, then required ones, each group alphabetical', () => {
    const set = new Set(['style', 'children']);
    const required = new Set(['title']);
    expect(
      orderPropNames(
        ['accessible', 'title', 'style', 'children', 'zIndex'],
        (name) => set.has(name),
        (name) => required.has(name),
      ),
    ).toEqual(['children', 'style', 'title', 'accessible', 'zIndex']);
  });
});
