import type { ComponentManifest, PropManifest } from '@rnjb/pack-schema';

/**
 * Merging a new extraction into the stored manifest (§7.2): what the team curated is never
 * overwritten, and everything that changed is reported so the team can review it.
 */

export interface ComponentChange {
  name: string;
  addedProps: string[];
  removedProps: string[];
  changedProps: string[];
}

export interface ManifestDiff {
  addedComponents: string[];
  removedComponents: string[];
  changedComponents: ComponentChange[];
}

export interface MergeResult {
  components: ComponentManifest[];
  diff: ManifestDiff;
}

const sameProp = (a: PropManifest, b: PropManifest) =>
  a.type === b.type &&
  a.kind === b.kind &&
  a.optional === b.optional &&
  a.default === b.default &&
  JSON.stringify(a.options ?? null) === JSON.stringify(b.options ?? null);

function diffComponent(
  previous: ComponentManifest,
  next: ComponentManifest,
): ComponentChange | undefined {
  const before = new Map(previous.props.map((prop) => [prop.name, prop]));
  const after = new Map(next.props.map((prop) => [prop.name, prop]));
  const change: ComponentChange = {
    name: next.name,
    addedProps: [...after.keys()].filter((name) => !before.has(name)),
    removedProps: [...before.keys()].filter((name) => !after.has(name)),
    changedProps: [...after.entries()]
      .filter(([name, prop]) => {
        const old = before.get(name);
        return old !== undefined && !sameProp(old, prop);
      })
      .map(([name]) => name),
  };
  return change.addedProps.length + change.removedProps.length + change.changedProps.length > 0
    ? change
    : undefined;
}

/** Curated data of the previous manifest that an extraction can never produce. */
function curatedFields(previous: ComponentManifest): Partial<ComponentManifest> {
  const hasRules = previous.nesting?.allowedChildren || previous.nesting?.allowedParents;
  return {
    ...(previous.formBinding ? { formBinding: previous.formBinding } : {}),
    ...(previous.editableTextProps ? { editableTextProps: previous.editableTextProps } : {}),
    ...(previous.iconProps ? { iconProps: previous.iconProps } : {}),
    ...(previous.supportsAbsolutePosition !== undefined
      ? { supportsAbsolutePosition: previous.supportsAbsolutePosition }
      : {}),
    ...(hasRules && previous.nesting ? { nesting: previous.nesting } : {}),
    ...(previous.origin === 'curated' && previous.category ? { category: previous.category } : {}),
  };
}

export function mergeManifest(
  previous: readonly ComponentManifest[],
  extracted: readonly ComponentManifest[],
): MergeResult {
  const before = new Map(previous.map((component) => [component.name, component]));
  const names = new Set(extracted.map((component) => component.name));
  const diff: ManifestDiff = { addedComponents: [], removedComponents: [], changedComponents: [] };
  const components: ComponentManifest[] = [];

  for (const next of extracted) {
    const old = before.get(next.name);
    if (!old) {
      diff.addedComponents.push(next.name);
      components.push(next);
      continue;
    }
    const change = diffComponent(old, next);
    if (change) diff.changedComponents.push(change);
    // A component curated as a whole keeps its props; only the diff reports what moved.
    if (old.origin === 'curated') {
      components.push(old);
      continue;
    }
    const curatedProps = new Map(
      old.props.filter((prop) => prop.origin === 'curated').map((prop) => [prop.name, prop]),
    );
    const props = next.props.map((prop) => curatedProps.get(prop.name) ?? prop);
    for (const [name, prop] of curatedProps) {
      if (!props.some((candidate) => candidate.name === name)) props.push(prop);
    }
    components.push({
      ...next,
      ...curatedFields(old),
      props: props.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  for (const old of previous) {
    if (names.has(old.name)) continue;
    diff.removedComponents.push(old.name);
    if (old.origin === 'curated') components.push(old);
  }

  components.sort((a, b) => a.name.localeCompare(b.name));
  return { components, diff };
}
