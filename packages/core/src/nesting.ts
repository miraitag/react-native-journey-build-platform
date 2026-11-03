import type { PropValue, Screen } from './entities.ts';

/** What the nesting rules need from a manifest; structural so core does not depend on packs. */
export interface NestingInfo {
  name: string;
  nesting?: {
    acceptsChildren: boolean;
    allowedChildren?: readonly string[];
    allowedParents?: readonly string[];
  };
}

export type NestingVerdict =
  { ok: true } | { ok: false; reason: 'noChildren' | 'childNotAllowed' | 'parentNotAllowed' };

/**
 * Whether `child` may go inside `parent` (§11.2). An unknown manifest (`undefined`) is allowed:
 * the screen root and components without an extracted pack must not block editing.
 */
export function checkNesting(
  parent: NestingInfo | undefined,
  child: NestingInfo | undefined,
): NestingVerdict {
  const parentRules = parent?.nesting;
  if (parentRules) {
    if (!parentRules.acceptsChildren) return { ok: false, reason: 'noChildren' };
    if (child && parentRules.allowedChildren && !parentRules.allowedChildren.includes(child.name)) {
      return { ok: false, reason: 'childNotAllowed' };
    }
  }
  const childRules = child?.nesting;
  if (parent && childRules?.allowedParents && !childRules.allowedParents.includes(parent.name)) {
    return { ok: false, reason: 'parentNotAllowed' };
  }
  return { ok: true };
}

export interface InsertionTarget {
  parentId: string;
  index: number;
}

/**
 * Where a new `child` lands when the user points at `targetNodeId`: inside it when it accepts the
 * child, otherwise right after it in the closest ancestor that does. `undefined` when nothing in
 * the chain accepts it (the screen root included).
 */
export function resolveInsertion(
  screen: Screen,
  targetNodeId: string | undefined,
  child: NestingInfo | undefined,
  infoOf: (nodeId: string) => NestingInfo | undefined,
): InsertionTarget | undefined {
  const parentOf = new Map<string, string>();
  for (const node of Object.values(screen.nodes)) {
    for (const childId of node.children) parentOf.set(childId, node.id);
  }
  const accepts = (nodeId: string): boolean => {
    const node = screen.nodes[nodeId];
    // Code blocks are leaves.
    return node?.kind === 'component' && checkNesting(infoOf(nodeId), child).ok;
  };

  let current = targetNodeId && screen.nodes[targetNodeId] ? targetNodeId : screen.rootId;
  if (accepts(current)) return { parentId: current, index: screen.nodes[current]!.children.length };
  for (;;) {
    const parentId = parentOf.get(current);
    if (!parentId) return undefined;
    if (accepts(parentId)) {
      const index = screen.nodes[parentId]!.children.indexOf(current);
      return { parentId, index: index + 1 };
    }
    current = parentId;
  }
}

interface PropShape {
  name: string;
  kind: string;
  optional: boolean;
  default?: string | number | boolean | null | undefined;
  options?: readonly (string | number | boolean)[] | undefined;
}

/** A neutral literal for `prop` by its kind; `undefined` for kinds a literal cannot express. */
export function defaultPropValue(prop: PropShape, componentName: string): PropValue | undefined {
  if (prop.default !== undefined) return { type: 'literal', value: prop.default };
  if (prop.kind === 'boolean') return { type: 'literal', value: false };
  if (prop.kind === 'number') return { type: 'literal', value: 0 };
  if (prop.kind === 'string') return { type: 'literal', value: componentName };
  if (prop.kind === 'enum' && prop.options?.[0] !== undefined) {
    return { type: 'literal', value: prop.options[0] };
  }
  return undefined;
}

/** Literal values for required props that have no default, so a new component is not empty. */
export function defaultPropsOf(component: {
  name: string;
  props: readonly PropShape[];
}): Record<string, PropValue> {
  const result: Record<string, PropValue> = {};
  for (const prop of component.props) {
    if (prop.optional || prop.default !== undefined || prop.name === 'children') continue;
    const value = defaultPropValue(prop, component.name);
    if (value) result[prop.name] = value;
  }
  return result;
}
