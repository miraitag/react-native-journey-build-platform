import { describe, expect, it } from 'vitest';
import type { Connection, Screen } from '@rnjb/core';
import { findNavigation } from './prototype.ts';

const node = (id: string, children: string[] = []) => ({
  id,
  kind: 'component',
  ref: { package: 'p', component: 'C', version: '1' },
  props: {},
  children,
  layout: {},
  spacing: {},
});

const screen = {
  id: 's1',
  name: 'Inicio',
  rootId: 'root',
  nodes: {
    root: node('root', ['button']),
    button: node('button', ['label']),
    label: node('label'),
  },
  states: [],
  logic: { hooks: [], blocks: [] },
} as unknown as Screen;

const connection = (overrides: Partial<Connection>): Connection => ({
  id: 'c1',
  fromScreenId: 's1',
  triggerNodeId: 'button',
  toScreenId: 's2',
  params: [],
  ...overrides,
});

describe('findNavigation', () => {
  it('finds the connection of the clicked node', () => {
    expect(findNavigation(screen, [connection({})], 'button')?.id).toBe('c1');
  });

  it('resolves a click on a descendant to its triggering ancestor', () => {
    expect(findNavigation(screen, [connection({})], 'label')?.id).toBe('c1');
  });

  it('ignores nodes without a trigger and connections of other screens', () => {
    expect(findNavigation(screen, [connection({})], 'root')).toBeUndefined();
    expect(findNavigation(screen, [connection({ fromScreenId: 's9' })], 'label')).toBeUndefined();
  });
});
