import { describe, expect, it } from 'vitest';
import type { ViewState } from '../app/tabs-store.ts';
import type { Screen } from '@rnjb/core';
import { navigateSelection, nextSelection, selectionOf } from './selection.ts';

const view = (selectedNodeId?: string, extraNodeIds?: string[]): ViewState => ({
  selectedScreenId: 's',
  selectedNodeId,
  ...(extraNodeIds ? { extraNodeIds } : {}),
  stateId: undefined,
  previewTheme: 'light',
  leftPanel: 'layers',
  problemsOpen: false,
});

describe('nextSelection', () => {
  it('a plain click selects only the node', () => {
    expect(nextSelection(view('a', ['b']), 's', 'c', false)).toEqual({
      selectedNodeId: 'c',
      extraNodeIds: [],
    });
  });

  it('Shift adds and removes nodes, keeping the first as primary', () => {
    const added = nextSelection(view('a'), 's', 'b', true);
    expect(added).toEqual({ selectedNodeId: 'a', extraNodeIds: ['b'] });
    expect(nextSelection(view('a', ['b']), 's', 'a', true)).toEqual({
      selectedNodeId: 'b',
      extraNodeIds: [],
    });
  });

  it('Shift on another screen starts a new selection', () => {
    expect(nextSelection(view('a'), 'other', 'x', true)).toEqual({
      selectedNodeId: 'x',
      extraNodeIds: [],
    });
  });

  it('lists the primary node first and tolerates views stored without extras', () => {
    expect(selectionOf(view('a', ['b', 'c']))).toEqual(['a', 'b', 'c']);
    expect(selectionOf(view('a'))).toEqual(['a']);
    expect(selectionOf(view())).toEqual([]);
  });
});

describe('navigateSelection', () => {
  const node = (id: string, children: string[] = []) =>
    ({ id, kind: 'component', children }) as unknown as Screen['nodes'][string];
  // root > [a > [a1, a2], b]
  const screen = {
    id: 's',
    rootId: 'root',
    nodes: {
      root: node('root', ['a', 'b']),
      a: node('a', ['a1', 'a2']),
      a1: node('a1'),
      a2: node('a2'),
      b: node('b'),
    },
  } as unknown as Screen;

  it('goes to the parent, and from the root back to the screen', () => {
    expect(navigateSelection(screen, view('a1'), 'parent')).toEqual({
      selectedNodeId: 'a',
      extraNodeIds: [],
    });
    expect(navigateSelection(screen, view('root'), 'parent')).toEqual({
      selectedNodeId: undefined,
      extraNodeIds: [],
    });
  });

  it('selects children, siblings, and cycles with next / previous', () => {
    expect(navigateSelection(screen, view('a'), 'children')).toEqual({
      selectedNodeId: 'a1',
      extraNodeIds: ['a2'],
    });
    expect(navigateSelection(screen, view('a1'), 'children')).toBeUndefined();
    expect(navigateSelection(screen, view('a2'), 'siblings')).toEqual({
      selectedNodeId: 'a2',
      extraNodeIds: ['a1'],
    });
    expect(navigateSelection(screen, view('a2'), 'next')?.selectedNodeId).toBe('a1');
    expect(navigateSelection(screen, view('a1'), 'previous')?.selectedNodeId).toBe('a2');
  });

  it('with only the screen selected, Enter and ⌘A pick the top-level nodes', () => {
    expect(navigateSelection(screen, view(), 'children')).toEqual({
      selectedNodeId: 'a',
      extraNodeIds: ['b'],
    });
    expect(navigateSelection(screen, view(), 'next')).toBeUndefined();
  });
});
