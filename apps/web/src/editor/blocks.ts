import type { ComponentRef, DocumentNode, NodeFragment } from '@rnjb/core';
import type { Block } from '../services/blocks-store.ts';
import type { DraggedComponent } from './insert-component.ts';

/** Pack ids are kebab/dot (`pack-schema`); accents and spaces become dashes. */
export function blockId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'block';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * A block has one root (§7.5). Several selected nodes go inside a `container`, only in the block:
 * the journey they came from does not change.
 */
export function blockFromFragment(
  fragment: NodeFragment,
  name: string,
  id: string,
  container: ComponentRef,
): Block {
  const single = fragment.rootIds.length === 1;
  const rootId = single ? (fragment.rootIds[0] as string) : `${id}-root`;
  const nodes: Record<string, DocumentNode> = single
    ? fragment.nodes
    : {
        ...fragment.nodes,
        [rootId]: {
          id: rootId,
          kind: 'component',
          ref: container,
          props: {},
          children: fragment.rootIds,
          layout: {},
          spacing: {},
        },
      };
  const requires = new Map<string, { package: string; component: string }>();
  for (const node of Object.values(nodes)) {
    if (node.kind !== 'component') continue;
    const { package: pkg, component } = node.ref;
    requires.set(`${pkg}/${component}`, { package: pkg, component });
  }
  return {
    id,
    name,
    rootId,
    nodes,
    ...(fragment.strings && Object.keys(fragment.strings).length > 0
      ? { strings: fragment.strings }
      : {}),
    requires: [...requires.values()],
  };
}

/** What dragging or adding a block inserts: its root decides where it may go. */
export function draggedOfBlock(block: Block): DraggedComponent {
  const root = block.nodes[block.rootId];
  return {
    package: root?.kind === 'component' ? root.ref.package : '',
    component: root?.kind === 'component' ? root.ref.component : '',
    block: {
      rootIds: [block.rootId],
      nodes: block.nodes as Record<string, DocumentNode>,
      ...(block.strings ? { strings: block.strings } : {}),
    },
  };
}
