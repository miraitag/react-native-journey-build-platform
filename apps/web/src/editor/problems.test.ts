import { describe, expect, it } from 'vitest';
import { createDocument, type RnjbDocument } from '@rnjb/core';
import { computeProblems, unresolvedLibraryCount } from './problems.ts';

const clock = { now: () => '2025-01-01T00:00:00.000Z' };

const base = (): RnjbDocument =>
  createDocument(
    {
      kind: 'journey',
      name: 'Demo',
      slug: 'demo',
      profile: { id: 'feature-library', version: '1.0.0' },
      libraries: [{ package: '@acme/ui', version: '1.0.0', packId: 'acme-ui' }],
      platformVersion: '0.1.0',
      formatVersion: 1,
    },
    clock,
  );

const screen = (id: string, states = 1): RnjbDocument['screens'][number] => ({
  id,
  name: id,
  rootId: `${id}-root`,
  nodes: {},
  states: Array.from({ length: states }, (_, index) => ({
    id: `${id}-s${index}`,
    name: 'loading',
    sample: {},
  })),
  logic: { hooks: [], blocks: [] },
});

describe('computeProblems', () => {
  it('reports libraries without a configured source', () => {
    const problems = computeProblems(base(), [], new Set());
    expect(problems.map((problem) => problem.id)).toEqual(['library-@acme/ui']);
    expect(computeProblems(base(), [], new Set(['@acme/ui']))).toEqual([]);
  });

  it('flags a missing initial screen, screens without states and dangling connections', () => {
    const document = base();
    document.libraries = [];
    document.screens = [screen('a'), screen('b', 0)];
    document.connections = [{ id: 'c1', fromScreenId: 'a', toScreenId: 'gone', params: [] }];
    const problems = computeProblems(document, [], new Set());
    expect(problems.map((problem) => [problem.id, problem.severity])).toEqual([
      ['no-initial', 'error'],
      ['connection-c1', 'error'],
      ['states-b', 'warning'],
    ]);
    expect(problems.find((problem) => problem.id === 'connection-c1')?.screenId).toBe('a');
  });

  it('keeps open issues first and in order', () => {
    const document = base();
    document.libraries = [];
    const problems = computeProblems(
      document,
      [{ code: 'RNJB-203', severity: 'error', params: {} }],
      new Set(),
    );
    expect(problems).toEqual([
      { id: 'issue-0', severity: 'error', text: { type: 'error', code: 'RNJB-203', params: {} } },
    ]);
  });

  it('counts unresolved libraries', () => {
    expect(unresolvedLibraryCount(base(), new Set())).toBe(1);
  });

  it('flags hooks used in a layer their pack does not allow (§14.2)', () => {
    const document = base();
    document.libraries = [];
    const withHooks = screen('a');
    withHooks.logic.hooks = [
      {
        id: 'h1',
        hook: 'useRepo',
        library: 'data-lib',
        version: '1',
        bindings: {},
        dependencies: [],
      },
      {
        id: 'h2',
        hook: 'useQuery',
        library: 'query',
        version: '1',
        bindings: {},
        dependencies: [],
      },
    ];
    document.screens = [withHooks];
    document.board.initialScreenId = 'a';
    const hooks = [
      {
        schemaVersion: 1 as const,
        id: 'p',
        name: 'P',
        version: '1',
        kind: 'hooks' as const,
        hooks: [
          {
            name: 'useRepo',
            importPath: 'x',
            library: 'data-lib',
            signature: 's',
            isEffect: false,
            allowedLayers: ['data' as const],
          },
          {
            name: 'useQuery',
            importPath: 'x',
            library: 'query',
            signature: 's',
            isEffect: false,
            allowedLayers: ['presentation' as const, 'data' as const],
          },
        ],
      },
    ];
    expect(computeProblems(document, [], new Set(), { hooks })).toMatchObject([
      { id: 'hook-layer-h1', severity: 'error', screenId: 'a' },
    ]);
    expect(computeProblems(document, [], new Set())).toEqual([]);
  });

  it('flags form fields bound to a node that is gone', () => {
    const document = base();
    document.libraries = [];
    document.screens = [screen('a')];
    document.board.initialScreenId = 'a';
    document.forms = [
      {
        id: 'f',
        screenId: 'a',
        name: 'login',
        dynamic: false,
        fields: [
          { id: 'x', name: 'email', type: 'email', required: true, messages: {}, nodeId: 'gone' },
        ],
      },
    ];
    expect(computeProblems(document, [], new Set(), { libraries: [] })).toMatchObject([
      { id: 'field-node-x', severity: 'error' },
    ]);
  });
});
