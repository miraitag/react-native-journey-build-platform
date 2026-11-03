import { describe, expect, it } from 'vitest';
import { applyCommand, type CommandContext } from './commands.ts';
import type { DocumentNode, RnjbDocument, Screen } from './entities.ts';
import {
  duplicateNodes,
  extractFragment,
  insertFragment,
  withStrings,
  wrapNodes,
} from './fragment.ts';

const node = (id: string, children: string[] = []): DocumentNode => ({
  id,
  kind: 'component',
  ref: { package: 'p', component: id, version: '1' },
  props: {},
  children,
  layout: {},
  spacing: {},
});

// root > [a > [a1], b, c]
const screen: Screen = {
  id: 's',
  name: 'S',
  rootId: 'root',
  nodes: {
    root: node('root', ['a', 'b', 'c']),
    a: node('a', ['a1']),
    a1: node('a1'),
    b: node('b'),
    c: node('c'),
  },
  states: [],
  logic: { hooks: [], blocks: [] },
};
const document = {
  screens: [screen],
  meta: {},
  strings: { 'home.title': 'Hola' },
} as unknown as RnjbDocument;

let n = 0;
const context: CommandContext = {
  ids: { next: () => `n${++n}` },
  clock: { now: () => 'now' },
};
const run = (command: Parameters<typeof applyCommand>[1]) =>
  applyCommand(document, command, context).document.screens[0] as Screen;

describe('extractFragment', () => {
  it('keeps the top-most nodes in tree order, with their subtrees, and drops the root', () => {
    const fragment = extractFragment(screen, ['c', 'a1', 'a', 'root']);
    expect(fragment?.rootIds).toEqual(['a', 'c']);
    expect(Object.keys(fragment?.nodes ?? {}).sort()).toEqual(['a', 'a1', 'c']);
    expect(extractFragment(screen, ['root'])).toBeUndefined();
  });
});

describe('fragment commands', () => {
  it('pastes a fragment with fresh ids at the given index', () => {
    const fragment = extractFragment(screen, ['a'])!;
    let created: string[] = [];
    const next = run(insertFragment('s', 'root', 3, fragment, (ids) => (created = ids)));
    expect(created).toHaveLength(1);
    const copy = next.nodes[created[0]!]!;
    expect(next.nodes.root?.children).toEqual(['a', 'b', 'c', copy.id]);
    expect(copy.children).toHaveLength(1);
    expect(copy.children[0]).not.toBe('a1');
  });

  it('duplicates each node right after itself', () => {
    const next = run(duplicateNodes('s', ['a', 'c']));
    const children = next.nodes.root?.children ?? [];
    expect(children).toHaveLength(5);
    expect([children[0], children[2], children[3]]).toEqual(['a', 'b', 'c']);
  });

  it('wraps siblings in a container at the place of the first one', () => {
    const ref = { package: 'react-native', component: 'View', version: '1' };
    let wrapper = '';
    const next = run(wrapNodes('s', ['c', 'b'], ref, (id) => (wrapper = id)));
    expect(next.nodes.root?.children).toEqual(['a', wrapper]);
    expect(next.nodes[wrapper]?.children).toEqual(['b', 'c']);
  });

  it('refuses to wrap nodes that are not siblings', () => {
    const ref = { package: 'react-native', component: 'View', version: '1' };
    expect(() => run(wrapNodes('s', ['a1', 'b'], ref))).toThrow(
      expect.objectContaining({ code: 'RNJB-610' }),
    );
  });

  it('carries the texts its string props use, without overwriting the target', () => {
    const titled = { ...node('t'), props: { label: { type: 'string', key: 'login.title' } } };
    const fragment = withStrings(
      { rootIds: ['t'], nodes: { t: titled as DocumentNode } },
      { 'login.title': 'Entrar', unused: 'x' },
    );
    expect(fragment.strings).toEqual({ 'login.title': 'Entrar' });
    const result = applyCommand(
      document,
      insertFragment('s', 'root', 0, {
        ...fragment,
        strings: { 'login.title': 'Entrar', 'home.title': 'otro' },
      }),
      context,
    ).document;
    expect(result.strings).toEqual({ 'home.title': 'Hola', 'login.title': 'Entrar' });
  });
});
