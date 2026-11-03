import { describe, expect, it } from 'vitest';
import type { ViewState } from '../app/tabs-store.ts';
import { nextSelection, selectionOf } from './selection.ts';

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
