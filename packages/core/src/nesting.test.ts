import { describe, expect, it } from 'vitest';
import type { ComponentNode, Screen } from './entities.ts';
import { checkNesting, defaultPropsOf, resolveInsertion, type NestingInfo } from './nesting.ts';

const node = (id: string, children: string[] = []): ComponentNode => ({
  id,
  kind: 'component',
  ref: { package: 'p', component: id, version: '1' },
  props: {},
  children,
  layout: {},
  spacing: {},
});

// root > [card > [row], leaf]
const screen: Screen = {
  id: 's',
  name: 'S',
  rootId: 'root',
  nodes: {
    root: node('root', ['card', 'leaf']),
    card: node('card', ['row']),
    row: node('row'),
    leaf: node('leaf'),
  },
  states: [],
  logic: { hooks: [], blocks: [] },
};

const rules: Record<string, NestingInfo> = {
  card: { name: 'Card', nesting: { acceptsChildren: true, allowedChildren: ['Row'] } },
  row: { name: 'Row', nesting: { acceptsChildren: true } },
  leaf: { name: 'Leaf', nesting: { acceptsChildren: false } },
};
const infoOf = (id: string) => rules[id];

describe('checkNesting', () => {
  it('allows unknown manifests so the screen root never blocks', () => {
    expect(checkNesting(undefined, { name: 'Chip' })).toEqual({ ok: true });
  });

  it('rejects children in a component that does not accept them', () => {
    expect(checkNesting(rules.leaf, { name: 'Chip' })).toEqual({ ok: false, reason: 'noChildren' });
  });

  it('honours allowedChildren and allowedParents', () => {
    expect(checkNesting(rules.card, { name: 'Chip' })).toEqual({
      ok: false,
      reason: 'childNotAllowed',
    });
    expect(checkNesting(rules.card, { name: 'Row' })).toEqual({ ok: true });
    expect(
      checkNesting(rules.row, {
        name: 'Tab',
        nesting: { acceptsChildren: false, allowedParents: ['Tabs'] },
      }),
    ).toEqual({ ok: false, reason: 'parentNotAllowed' });
  });
});

describe('resolveInsertion', () => {
  const chip: NestingInfo = { name: 'Chip' };

  it('goes inside the target when it accepts the child, at the end', () => {
    expect(resolveInsertion(screen, 'row', chip, infoOf)).toEqual({ parentId: 'row', index: 0 });
  });

  it('goes after the target inside the closest ancestor that accepts it', () => {
    // leaf accepts nothing; root (unknown manifest) does.
    expect(resolveInsertion(screen, 'leaf', chip, infoOf)).toEqual({ parentId: 'root', index: 2 });
    // card rejects Chip (allowedChildren), so a drop on card lands after it in root.
    expect(resolveInsertion(screen, 'card', chip, infoOf)).toEqual({ parentId: 'root', index: 1 });
  });

  it('defaults to the root when nothing is targeted', () => {
    expect(resolveInsertion(screen, undefined, chip, infoOf)).toEqual({
      parentId: 'root',
      index: 2,
    });
  });

  it('returns undefined when no ancestor accepts it', () => {
    const strict = (id: string) =>
      id === 'root' ? { name: 'Root', nesting: { acceptsChildren: false } } : infoOf(id);
    expect(resolveInsertion(screen, 'leaf', chip, strict)).toBeUndefined();
  });

  it('never nests inside a code block', () => {
    const withCode: Screen = {
      ...screen,
      nodes: {
        ...screen.nodes,
        leaf: {
          id: 'leaf',
          kind: 'code',
          code: { language: 'tsx', source: '', imports: [] },
          children: [],
        },
      },
    };
    expect(resolveInsertion(withCode, 'leaf', chip, () => undefined)).toEqual({
      parentId: 'root',
      index: 2,
    });
  });
});

describe('defaultPropsOf', () => {
  it('fills only required props without a default', () => {
    expect(
      defaultPropsOf({
        name: 'Chip',
        props: [
          { name: 'label', kind: 'string', optional: false },
          { name: 'size', kind: 'enum', optional: false, options: ['sm', 'lg'] },
          { name: 'count', kind: 'number', optional: false },
          { name: 'on', kind: 'boolean', optional: false },
          { name: 'tone', kind: 'string', optional: true },
          { name: 'kind', kind: 'string', optional: false, default: 'a' },
          { name: 'children', kind: 'node', optional: false },
          { name: 'onPress', kind: 'function', optional: false },
        ],
      }),
    ).toEqual({
      label: { type: 'literal', value: 'Chip' },
      size: { type: 'literal', value: 'sm' },
      count: { type: 'literal', value: 0 },
      on: { type: 'literal', value: false },
    });
  });
});
