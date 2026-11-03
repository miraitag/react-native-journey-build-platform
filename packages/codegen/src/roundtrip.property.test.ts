import fc from 'fast-check';
import {
  applyBasicJourney,
  createDocument,
  type ComponentNode,
  type DocumentNode,
  type PropValue,
  type RnjbDocument,
  type Screen,
  type SpacingValue,
} from '@rnjb/core';
import { defaultProfile } from '@rnjb/profiles';
import { describe, expect, it } from 'vitest';
import { emitProject } from './emit.ts';
import { parseProject } from './parse.ts';

/** Property (§23.2): `parse(emit(x)) = x` for what the screen codecs carry. */

const ident = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,8}$/);
const tokenName = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,8}$/);
const tokenGroup = fc.constantFrom('colors', 'space', 'typography.heading', 'brand-x');

const propValue: fc.Arbitrary<PropValue> = fc.oneof(
  fc.record({
    type: fc.constant('literal' as const),
    value: fc.oneof(fc.string(), fc.integer({ min: -1000, max: 1000 }), fc.boolean()),
  }),
  fc.record({ type: fc.constant('string' as const), key: fc.oneof(ident, fc.constant('a.b')) }),
  fc.record({ type: fc.constant('token' as const), group: tokenGroup, name: tokenName }),
  fc.record({
    type: fc.constant('binding' as const),
    source: fc.constantFrom('uiState' as const, 'form' as const, 'param' as const),
    path: fc.array(ident, { minLength: 1, maxLength: 3 }).map((parts) => parts.join('.')),
  }),
);

const spacingValue: fc.Arbitrary<SpacingValue> = fc.oneof(
  fc.record({ type: fc.constant('literal' as const), value: fc.integer({ min: 0, max: 64 }) }),
  fc.record({ type: fc.constant('token' as const), group: tokenGroup, name: tokenName }),
);

interface Shape {
  component: string;
  props: Record<string, PropValue>;
  layout: ComponentNode['layout'];
  spacing: ComponentNode['spacing'];
  children: Shape[];
}

/** Trees at most `depth` levels deep, so each run stays small (up to 15 nodes). */
const rawShapeAt = (depth: number): fc.Arbitrary<Shape> =>
  fc.record({
    component: fc.constantFrom('Button', 'Text', 'Card'),
    props: fc.dictionary(
      ident.filter((name) => name !== 'style' && name !== 'key'),
      propValue,
      {
        maxKeys: 4,
      },
    ),
    layout: fc.record(
      {
        flexDirection: fc.constantFrom('row' as const, 'column' as const),
        width: fc.integer({ min: 1, max: 400 }),
      },
      { requiredKeys: [] },
    ),
    spacing: fc.record(
      {
        // An empty `padding` means the same as none, so it is not generated.
        padding: fc
          .record({ left: spacingValue, top: spacingValue }, { requiredKeys: [] })
          .filter((sides) => Object.keys(sides).length > 0),
        gap: spacingValue,
      },
      { requiredKeys: [] },
    ),
    children: depth > 0 ? fc.array(shapeAt(depth - 1), { maxLength: 2 }) : fc.constant([]),
  });
/** Leaves may carry text content (`<Text>…</Text>`), any string at all. */
const shapeAt = (depth: number): fc.Arbitrary<Shape> =>
  fc
    .tuple(rawShapeAt(depth), fc.option(fc.string(), { nil: undefined }))
    .map(([node, text]) =>
      text !== undefined && node.children.length === 0
        ? { ...node, props: { ...node.props, children: { type: 'literal', value: text } } }
        : node,
    );
const shape = shapeAt(3);

const base = applyBasicJourney(
  createDocument(
    {
      kind: 'journey',
      name: 'Prop',
      slug: 'prop',
      profile: { id: 'feature-library', version: '1.0.0' },
      libraries: [],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    { now: () => '2026-01-01T00:00:00.000Z' },
  ),
  { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: ['success'] },
  {
    ids: {
      next: (() => {
        let n = 0;
        return () => `b${++n}`;
      })(),
    },
    clock: { now: () => '' },
  },
);

/** Puts a generated tree under the screen root, with fresh ids. */
function withTree(tree: Shape): RnjbDocument {
  const screen = base.screens[0] as Screen;
  const nodes: Record<string, DocumentNode> = { ...screen.nodes };
  let next = 0;
  const add = (node: Shape): string => {
    const id = `n${++next}`;
    nodes[id] = {
      id,
      kind: 'component',
      ref: { package: '@acme/ui', component: node.component, version: '1.0.0' },
      props: node.props,
      children: node.children.map(add),
      layout: node.layout,
      spacing: node.spacing,
    };
    return id;
  };
  const root = nodes[screen.rootId] as ComponentNode;
  nodes[screen.rootId] = {
    ...root,
    ref: { package: '@acme/ui', component: 'Screen', version: '1.0.0' },
    children: [add(tree)],
  };
  return { ...base, screens: [{ ...screen, nodes }] };
}

/** The tree as data, without ids (parse derives its own). */
function shapeOf(screen: Screen, id: string): unknown {
  const node = screen.nodes[id];
  if (node?.kind !== 'component') return node?.kind;
  return {
    component: node.ref.component,
    props: node.props,
    layout: node.layout,
    spacing: node.spacing,
    children: node.children.map((child) => shapeOf(screen, child)),
  };
}

describe('screen codecs round trip (§23.2)', () => {
  it('parse(emit(x)) keeps components, props, layout and spacing', () => {
    fc.assert(
      fc.property(shape, (tree) => {
        const doc = withTree(tree);
        const parsed = parseProject(emitProject(doc, defaultProfile).files, defaultProfile);
        const original = doc.screens[0] as Screen;
        const back = parsed.project.screens[0] as Screen;
        expect(shapeOf(back, back.rootId)).toEqual(shapeOf(original, original.rootId));
      }),
      {
        numRuns: 150,
        // Text that JSX attributes treat specially, checked on every run.
        examples: ['a &amp; b', '{x}', "it's", 'a"b', 'a\\b', 'two\nlines', ' edge ', '<b>'].map(
          (text): [Shape] => [
            {
              component: 'Text',
              props: { label: { type: 'literal', value: text } },
              layout: {},
              spacing: {},
              children: [],
            },
          ],
        ),
      },
    );
  });
});
