import type { Screen } from './entities.ts';
import { checkNesting, type InsertionTarget, type NestingInfo } from './nesting.ts';

/** Where a dragged layer lands relative to the row it is dropped on. */
export type DropPosition = 'before' | 'inside' | 'after';

/**
 * Where an existing node goes when dropped `position` of `targetId` (the Layers tree). The parent
 * must be a component that accepts the node (§11.2); code blocks are leaves. `undefined` for the
 * root, for a drop on the node itself or inside its own subtree, when nesting forbids it, or when
 * the node would stay exactly where it is. `index` is the one `moveNode` expects.
 */
export function planMove(
  screen: Screen,
  nodeId: string,
  targetId: string,
  position: DropPosition,
  infoOf: (nodeId: string) => NestingInfo | undefined,
): InsertionTarget | undefined {
  if (nodeId === screen.rootId || nodeId === targetId || !screen.nodes[targetId]) return undefined;
  const parentOf = new Map<string, string>();
  for (const node of Object.values(screen.nodes)) {
    for (const childId of node.children) parentOf.set(childId, node.id);
  }
  // Dropping into its own subtree would create a cycle.
  for (let id: string | undefined = targetId; id !== undefined; id = parentOf.get(id)) {
    if (id === nodeId) return undefined;
  }
  const parentId = position === 'inside' ? targetId : parentOf.get(targetId);
  const parent = parentId === undefined ? undefined : screen.nodes[parentId];
  if (parentId === undefined || parent?.kind !== 'component') return undefined;
  if (!checkNesting(infoOf(parentId), infoOf(nodeId)).ok) return undefined;

  const siblings = parent.children;
  let index =
    position === 'inside'
      ? siblings.length
      : siblings.indexOf(targetId) + (position === 'after' ? 1 : 0);
  const current = siblings.indexOf(nodeId);
  // `moveNode` removes the node first, so a later slot shifts one place up.
  if (current !== -1 && current < index) index -= 1;
  if (current !== -1 && current === index) return undefined;
  return { parentId, index };
}
