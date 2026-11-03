import { describe, expect, it } from 'vitest';
import { addScreen, applyCommand, createDocument, type CommandContext } from './commands.ts';
import { addHook, removeHook, setHookBody, updateHook } from './logic.ts';
import { RnjbError } from './errors.ts';

function setup() {
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  let screenId = '';
  let doc = createDocument(
    {
      kind: 'journey',
      name: 'T',
      slug: 'tst',
      profile: { id: 'p', version: '1.0.0' },
      libraries: [],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    ctx.clock,
  );
  doc = applyCommand(
    doc,
    addScreen(
      { name: 'A', root: { package: 'react-native', component: 'View', version: '*' } },
      (id) => (screenId = id),
    ),
    ctx,
  ).document;
  return { ctx, doc, screenId };
}

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof RnjbError ? error.code : 'other';
  }
  return 'none';
};

describe('screen logic', () => {
  it('adds hooks, links dependencies and drops links when a hook is removed', () => {
    const { ctx, doc, screenId } = setup();
    let a = '';
    let b = '';
    const input = { library: '@tanstack/react-query', version: '5.0.0' };
    let next = applyCommand(
      doc,
      addHook(screenId, { hook: 'useQuery', ...input }, (id) => (a = id)),
      ctx,
    ).document;
    next = applyCommand(
      next,
      addHook(screenId, { hook: 'useUser', ...input }, (id) => (b = id)),
      ctx,
    ).document;
    next = applyCommand(
      next,
      updateHook(screenId, b, { dependencies: [a], bindings: { id: 'param.id' } }),
      ctx,
    ).document;
    expect(next.screens[0]?.logic.hooks[1]).toMatchObject({
      dependencies: [a],
      bindings: { id: 'param.id' },
    });

    next = applyCommand(next, removeHook(screenId, a), ctx).document;
    expect(next.screens[0]?.logic.hooks[0]?.dependencies).toEqual([]);
  });

  it('rejects cycles, unknown hooks and invalid names', () => {
    const { ctx, doc, screenId } = setup();
    let a = '';
    let b = '';
    const input = { library: 'x', version: '1.0.0' };
    let next = applyCommand(
      doc,
      addHook(screenId, { hook: 'useA', ...input }, (id) => (a = id)),
      ctx,
    ).document;
    next = applyCommand(
      next,
      addHook(screenId, { hook: 'useB', ...input }, (id) => (b = id)),
      ctx,
    ).document;
    next = applyCommand(next, updateHook(screenId, a, { dependencies: [b] }), ctx).document;

    expect(
      codeOf(() => applyCommand(next, updateHook(screenId, b, { dependencies: [a] }), ctx)),
    ).toBe('RNJB-603');
    expect(
      codeOf(() => applyCommand(next, updateHook(screenId, a, { dependencies: [a] }), ctx)),
    ).toBe('RNJB-603');
    expect(
      codeOf(() => applyCommand(next, updateHook(screenId, a, { dependencies: ['nope'] }), ctx)),
    ).toBe('RNJB-608');
    expect(
      codeOf(() => applyCommand(next, addHook(screenId, { hook: 'notAHook', ...input }), ctx)),
    ).toBe('RNJB-609');
    expect(codeOf(() => applyCommand(next, addHook('nope', { hook: 'useX', ...input }), ctx))).toBe(
      'RNJB-602',
    );
    expect(
      codeOf(() => applyCommand(next, updateHook(screenId, a, { bindings: { '': 'x' } }), ctx)),
    ).toBe('RNJB-609');
  });

  it('stores and clears the body of an effect', () => {
    const { ctx, doc, screenId } = setup();
    let id = '';
    let next = applyCommand(
      doc,
      addHook(
        screenId,
        { hook: 'useEffect', library: 'react', version: '19.0.0' },
        (hookId) => (id = hookId),
      ),
      ctx,
    ).document;
    next = applyCommand(
      next,
      setHookBody(screenId, id, { source: 'console.log(1)' }),
      ctx,
    ).document;
    expect(next.screens[0]?.logic.hooks[0]?.body).toMatchObject({
      language: 'ts',
      source: 'console.log(1)',
    });
    next = applyCommand(next, setHookBody(screenId, id, { source: '  ' }), ctx).document;
    expect(next.screens[0]?.logic.hooks[0]?.body).toBeUndefined();
  });
});
