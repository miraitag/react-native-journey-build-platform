import {
  defaultPropsOf,
  insertNode,
  moveNode,
  planMove,
  resolveInsertion,
  type Command,
  type DocumentNode,
  type DropPosition,
  type InsertionTarget,
  type NestingInfo,
  type Screen,
} from '@rnjb/core';
import type { LibraryPack } from '@rnjb/pack-schema';

/** What is being dragged out of the catalog. */
export interface DraggedComponent {
  package: string;
  component: string;
}

function manifestOf(packs: readonly LibraryPack[], pkg: string, component: string) {
  const pack = packs.find((candidate) => candidate.package === pkg);
  const manifest = pack?.components.find((candidate) => candidate.name === component);
  return pack && manifest ? { pack, manifest } : undefined;
}

/** Nesting rules of a component as its manifest declares them; `undefined` without a manifest. */
function nestingOf(
  packs: readonly LibraryPack[],
  pkg: string,
  component: string,
): NestingInfo | undefined {
  const manifest = manifestOf(packs, pkg, component)?.manifest;
  return (
    manifest && {
      name: manifest.name,
      ...(manifest.nesting ? { nesting: manifest.nesting } : {}),
    }
  );
}

/**
 * Nesting info of a node. Without a manifest the node still has a name, so a child that may only
 * go inside certain containers is refused elsewhere; the node itself imposes no rules.
 */
function nodeInfo(
  packs: readonly LibraryPack[],
  node: DocumentNode | undefined,
): NestingInfo | undefined {
  if (node?.kind !== 'component') return undefined;
  return nestingOf(packs, node.ref.package, node.ref.component) ?? { name: node.ref.component };
}

/** Where `item` would land when the user points at `targetNodeId`; `undefined` if nowhere. */
export function planInsertion(
  screen: Screen,
  packs: readonly LibraryPack[],
  item: DraggedComponent,
  targetNodeId: string | undefined,
): InsertionTarget | undefined {
  return resolveInsertion(
    screen,
    targetNodeId,
    nestingOf(packs, item.package, item.component),
    (nodeId) => nodeInfo(packs, screen.nodes[nodeId]),
  );
}

/** Command that inserts `item` where `planInsertion` says; `undefined` when it cannot go anywhere. */
export function insertComponentCommand(
  screen: Screen,
  packs: readonly LibraryPack[],
  item: DraggedComponent,
  targetNodeId: string | undefined,
  onCreated?: (nodeId: string) => void,
): Command | undefined {
  const target = planInsertion(screen, packs, item, targetNodeId);
  if (!target) return undefined;
  const found = manifestOf(packs, item.package, item.component);
  return insertNode(
    {
      screenId: screen.id,
      parentId: target.parentId,
      index: target.index,
      node: {
        id: 'new',
        kind: 'component',
        ref: {
          package: item.package,
          component: item.component,
          version: found?.pack.packageVersion ?? '0.0.0',
        },
        props: found ? defaultPropsOf(found.manifest) : {},
        children: [],
        layout: {},
        spacing: {},
      },
    },
    onCreated,
  );
}

/** Where `nodeId` would land if dropped `position` of `targetId` in the Layers tree. */
export function planNodeMove(
  screen: Screen,
  packs: readonly LibraryPack[],
  nodeId: string,
  targetId: string,
  position: DropPosition,
): InsertionTarget | undefined {
  return planMove(screen, nodeId, targetId, position, (id) => nodeInfo(packs, screen.nodes[id]));
}

/** Command that moves `nodeId` as `planNodeMove` says; `undefined` when it cannot go there. */
export function moveNodeCommand(
  screen: Screen,
  packs: readonly LibraryPack[],
  nodeId: string,
  targetId: string,
  position: DropPosition,
): Command | undefined {
  const target = planNodeMove(screen, packs, nodeId, targetId, position);
  return target && moveNode(screen.id, nodeId, target.parentId, target.index);
}
