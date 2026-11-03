import { describe, expect, it } from 'vitest';
import type { HookUsage, ScreenLogic } from '@rnjb/core';
import { layoutHookGraph } from './hook-graph.ts';

const hook = (id: string, dependencies: string[] = []): HookUsage => ({
  id,
  hook: `use${id.toUpperCase()}`,
  library: 'x',
  version: '1.0.0',
  bindings: {},
  dependencies,
});

describe('layoutHookGraph', () => {
  it('puts each hook one column after its deepest dependency', () => {
    const logic: ScreenLogic = {
      hooks: [hook('c', ['b', 'a']), hook('b', ['a']), hook('a'), hook('d')],
      blocks: [],
    };
    const graph = layoutHookGraph(logic);
    const column = (id: string) => graph.nodes.find((node) => node.id === id)?.column;
    expect([column('a'), column('b'), column('c'), column('d')]).toEqual([0, 1, 2, 0]);
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
    expect(graph.edges).toContainEqual({ from: 'c', to: 'b' });
  });

  it('ignores unknown dependencies and survives a cycle', () => {
    const logic: ScreenLogic = {
      hooks: [hook('a', ['ghost']), hook('x', ['y']), hook('y', ['x'])],
      blocks: [],
    };
    const graph = layoutHookGraph(logic);
    expect(graph.edges.some((edge) => edge.to === 'ghost')).toBe(false);
    expect(graph.nodes).toHaveLength(3);
  });

  it('is empty without hooks', () => {
    expect(layoutHookGraph({ hooks: [], blocks: [] })).toEqual({
      nodes: [],
      edges: [],
      columns: 0,
      rows: 0,
    });
  });
});
