import { describe, expect, it } from 'vitest';
import type { ComponentNode, Screen } from './entities.ts';
import { planMove } from './move.ts';
import type { NestingInfo } from './nesting.ts';

const comp = (id: string, children: string[] = [], kind: 'component' | 'code' = 'component') =>
  (kind === 'code'
    ? { id, kind, children: [] }
    : {
        id,
        kind,
        ref: { package: 'p', component: id, version: '1' },
        props: {},
        children,
        layout: {},
        spacing: {},
      }) as unknown as ComponentNode;

// root > [a > [a1, a2], b, c(code)]
const screen = {
  id: 's',
  rootId: 'root',
  nodes: {
    root: comp('root', ['a', 'b', 'c']),
    a: comp('a', ['a1', 'a2']),
    a1: comp('a1'),
    a2: comp('a2'),
    b: comp('b'),
    c: comp('c', [], 'code'),
  },
} as unknown as Screen;

const open = () => undefined;

describe('planMove', () => {
  it('moves before and after a sibling, accounting for the removal', () => {
    expect(planMove(screen, 'a', 'b', 'after', open)).toEqual({ parentId: 'root', index: 1 });
    expect(planMove(screen, 'b', 'a', 'before', open)).toEqual({ parentId: 'root', index: 0 });
    expect(planMove(screen, 'a1', 'a2', 'after', open)).toEqual({ parentId: 'a', index: 1 });
  });

  it('moves inside a container as its last child, and across parents', () => {
    expect(planMove(screen, 'b', 'a', 'inside', open)).toEqual({ parentId: 'a', index: 2 });
    expect(planMove(screen, 'a1', 'b', 'before', open)).toEqual({ parentId: 'root', index: 1 });
  });

  it('refuses no-ops, the root, itself, its own subtree and code blocks as parents', () => {
    expect(planMove(screen, 'a', 'b', 'before', open)).toBeUndefined();
    expect(planMove(screen, 'b', 'a', 'after', open)).toBeUndefined();
    expect(planMove(screen, 'root', 'b', 'after', open)).toBeUndefined();
    expect(planMove(screen, 'a', 'a', 'inside', open)).toBeUndefined();
    expect(planMove(screen, 'a', 'a1', 'inside', open)).toBeUndefined();
    expect(planMove(screen, 'b', 'c', 'inside', open)).toBeUndefined();
    expect(planMove(screen, 'b', 'root', 'before', open)).toBeUndefined();
  });

  it('respects nesting rules of the new parent', () => {
    const infoOf = (id: string): NestingInfo | undefined =>
      id === 'a' ? { name: 'a', nesting: { acceptsChildren: false } } : undefined;
    expect(planMove(screen, 'b', 'a', 'inside', infoOf)).toBeUndefined();
    expect(planMove(screen, 'b', 'a2', 'after', infoOf)).toBeUndefined();
    expect(planMove(screen, 'b', 'a', 'before', infoOf)).toEqual({ parentId: 'root', index: 0 });
  });
});
