import type { Connection, Screen } from '@rnjb/core';

/**
 * Prototype mode: the connection a click on `nodeId` triggers. The click lands on the deepest
 * node, so the node's ancestors are checked too (a button's label should trigger the button).
 */
export function findNavigation(
  screen: Screen,
  connections: readonly Connection[],
  nodeId: string,
): Connection | undefined {
  const parents = new Map<string, string>();
  for (const node of Object.values(screen.nodes)) {
    for (const child of node.children) parents.set(child, node.id);
  }
  const seen = new Set<string>();
  for (let id: string | undefined = nodeId; id && !seen.has(id); id = parents.get(id)) {
    seen.add(id);
    const found = connections.find(
      (connection) => connection.fromScreenId === screen.id && connection.triggerNodeId === id,
    );
    if (found) return found;
  }
  return undefined;
}
