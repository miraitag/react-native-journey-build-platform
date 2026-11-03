import type { HookUsage, ScreenLogic } from '@rnjb/core';

export interface GraphNode {
  id: string;
  label: string;
  /** Column: 0 has no dependencies; each hook sits one column after its deepest dependency. */
  column: number;
  /** Row inside its column. */
  row: number;
}

export interface GraphEdge {
  /** The hook that depends on `to`. */
  from: string;
  to: string;
}

export interface HookGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  columns: number;
  rows: number;
}

/** Layered layout of the dependency graph (§14.2); dependencies on unknown hooks are ignored. */
export function layoutHookGraph(logic: ScreenLogic): HookGraph {
  const byId = new Map<string, HookUsage>(logic.hooks.map((hook) => [hook.id, hook]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const columnOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    // A cycle cannot be created by the commands; this only keeps hand-edited files from looping.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const hook = byId.get(id);
    const dependencies = hook?.dependencies.filter((dependency) => byId.has(dependency)) ?? [];
    const column = dependencies.length === 0 ? 0 : 1 + Math.max(...dependencies.map(columnOf));
    visiting.delete(id);
    depth.set(id, column);
    return column;
  };

  const rowsUsed = new Map<number, number>();
  const nodes = logic.hooks.map((hook): GraphNode => {
    const column = columnOf(hook.id);
    const row = rowsUsed.get(column) ?? 0;
    rowsUsed.set(column, row + 1);
    return { id: hook.id, label: hook.hook, column, row };
  });
  const edges = logic.hooks.flatMap((hook) =>
    hook.dependencies.filter((id) => byId.has(id)).map((id) => ({ from: hook.id, to: id })),
  );
  return {
    nodes,
    edges,
    columns: nodes.reduce((max, node) => Math.max(max, node.column + 1), 0),
    rows: Math.max(0, ...rowsUsed.values()),
  };
}
