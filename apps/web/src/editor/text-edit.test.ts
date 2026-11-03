import { describe, expect, it } from 'vitest';
import type { DocumentNode } from '@rnjb/core';
import { textPropOf } from './text-edit.ts';

const node = (props: Record<string, unknown>): DocumentNode =>
  ({
    kind: 'component',
    id: 'n',
    ref: { package: 'p', component: 'Text', version: '1' },
    props,
    children: [],
  }) as unknown as DocumentNode;

describe('textPropOf', () => {
  it('prefers a text-like prop and resolves document strings', () => {
    expect(
      textPropOf(
        node({
          tone: { type: 'string', key: 'k.tone' },
          title: { type: 'string', key: 'k.title' },
        }),
        { 'k.title': 'Hola' },
      ),
    ).toEqual({ name: 'title', text: 'Hola' });
    expect(textPropOf(node({ other: { type: 'string', key: 'k' } }), {})).toEqual({
      name: 'other',
      text: '',
    });
  });

  it('accepts string literals only in text-like props', () => {
    expect(textPropOf(node({ label: { type: 'literal', value: 'x' } }), {})).toEqual({
      name: 'label',
      text: 'x',
    });
    expect(textPropOf(node({ tone: { type: 'literal', value: 'a' } }), {})).toBeUndefined();
    expect(textPropOf(node({ title: { type: 'literal', value: 3 } }), {})).toBeUndefined();
    expect(textPropOf(node({ title: { type: 'expression', code: 'x' } }), {})).toBeUndefined();
  });

  it('has no text for code nodes or missing nodes', () => {
    expect(textPropOf(undefined, {})).toBeUndefined();
    expect(
      textPropOf({ kind: 'code', id: 'c', children: [] } as unknown as DocumentNode, {}),
    ).toBeUndefined();
  });
});
