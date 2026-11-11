import {
  checkNesting,
  defaultPropsOf,
  insertFragment,
  insertNode,
  moveNode,
  planMove,
  resolveInsertion,
  wrapNodes,
  type Command,
  type ComponentRef,
  type DocumentNode,
  type DropPosition,
  type InsertionTarget,
  type NestingInfo,
  type NodeFragment,
  type Screen,
} from '@rnjb/core';
import type { LibraryPack } from '@rnjb/pack-schema';

/** What is being dragged out of the catalog or the Blocks panel. */
export interface DraggedComponent {
  package: string;
  component: string;
  /** Set for a block: its nodes are copied with fresh ids; `package`/`component` are its root's. */
  block?: NodeFragment;
  /** A variant picked in the catalog (§11.3): the node starts with this prop set. */
  variant?: { prop: string; value: string | number | boolean };
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
  if (item.block) {
    return pasteCommand(screen, packs, item.block, targetNodeId, (ids) => {
      if (ids[0]) onCreated?.(ids[0]);
    });
  }
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
        props: {
          ...(found ? defaultPropsOf(found.manifest) : {}),
          ...(item.variant
            ? { [item.variant.prop]: { type: 'literal', value: item.variant.value } }
            : {}),
        },
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

/** Where a pasted fragment lands when the user points at `targetNodeId`; every root must fit there. */
export function pasteCommand(
  screen: Screen,
  packs: readonly LibraryPack[],
  fragment: NodeFragment,
  targetNodeId: string | undefined,
  onCreated?: (nodeIds: string[]) => void,
): Command | undefined {
  const infos = fragment.rootIds.map((id) => nodeInfo(packs, fragment.nodes[id]));
  const target = resolveInsertion(screen, targetNodeId, infos[0], (id) =>
    nodeInfo(packs, screen.nodes[id]),
  );
  if (!target) return undefined;
  const parent = nodeInfo(packs, screen.nodes[target.parentId]);
  if (!infos.every((info) => checkNesting(parent, info).ok)) return undefined;
  return insertFragment(screen.id, target.parentId, target.index, fragment, onCreated);
}

/**
 * Wraps sibling nodes in a `View` of the React Native pack (§10.3). `undefined` when the nesting
 * rules forbid the container where the nodes are, or the nodes inside it.
 */
export function wrapCommand(
  screen: Screen,
  packs: readonly LibraryPack[],
  rootIds: readonly string[],
  onCreated?: (nodeId: string) => void,
): Command | undefined {
  const pack = packs.find((candidate) => candidate.package === 'react-native');
  const container: ComponentRef = {
    package: 'react-native',
    component: 'View',
    version: pack?.packageVersion ?? '*',
  };
  const info = nestingOf(packs, container.package, container.component) ?? { name: 'View' };
  const parentId = Object.values(screen.nodes).find((node) =>
    node.children.includes(rootIds[0] ?? ''),
  )?.id;
  const parent = parentId ? nodeInfo(packs, screen.nodes[parentId]) : undefined;
  const fits =
    checkNesting(parent, info).ok &&
    rootIds.every((id) => checkNesting(info, nodeInfo(packs, screen.nodes[id])).ok);
  return fits ? wrapNodes(screen.id, rootIds, container, onCreated) : undefined;
}
