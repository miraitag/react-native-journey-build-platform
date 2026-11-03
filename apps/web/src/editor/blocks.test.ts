import { describe, expect, it } from 'vitest';
import type { DocumentNode } from '@rnjb/core';
import { blockFromFragment, blockId, draggedOfBlock } from './blocks.ts';

const node = (id: string, component: string, children: string[] = []): DocumentNode => ({
  id,
  kind: 'component',
  ref: { package: 'ui', component, version: '1' },
  props: {},
  children,
  layout: {},
  spacing: {},
});
const view = { package: 'react-native', component: 'View', version: '0.80.0' };

describe('blocks', () => {
  it('derives a pack id from the name and avoids the ones taken', () => {
    expect(blockId('Tarjeta de pago', new Set())).toBe('tarjeta-de-pago');
    expect(blockId('Tarjeta de pago', new Set(['tarjeta-de-pago']))).toBe('tarjeta-de-pago-2');
    expect(blockId('¡!', new Set())).toBe('block');
  });

  it('keeps a single root and lists what the block requires', () => {
    const block = blockFromFragment(
      { rootIds: ['a'], nodes: { a: node('a', 'Card', ['b']), b: node('b', 'Text') } },
      'Card',
      'card',
      view,
    );
    expect(block.rootId).toBe('a');
    expect(block.requires).toEqual([
      { package: 'ui', component: 'Card' },
      { package: 'ui', component: 'Text' },
    ]);
    expect(block.strings).toBeUndefined();
  });

  it('puts several roots inside the container and inserts as that container', () => {
    const block = blockFromFragment(
      {
        rootIds: ['a', 'b'],
        nodes: { a: node('a', 'Text'), b: node('b', 'Button') },
        strings: { 'x.title': 'Hola' },
      },
      'Pair',
      'pair',
      view,
    );
    expect(block.nodes[block.rootId]?.children).toEqual(['a', 'b']);
    expect(block.strings).toEqual({ 'x.title': 'Hola' });
    const dragged = draggedOfBlock(block);
    expect(dragged).toMatchObject({ package: 'react-native', component: 'View' });
    expect(dragged.block?.rootIds).toEqual([block.rootId]);
    expect(dragged.block?.strings).toEqual({ 'x.title': 'Hola' });
  });
});
