import { describe, expect, it } from 'vitest';
import type { Form, Screen } from '@rnjb/core';
import type { LibraryPack } from '@rnjb/pack-schema';
import { withSimulatedErrors } from './simulate-errors.ts';

const screen: Screen = {
  id: 's',
  name: 'S',
  rootId: 'root',
  nodes: {
    root: {
      id: 'root',
      kind: 'component',
      ref: { package: 'ui', component: 'View', version: '1' },
      props: {},
      children: ['input'],
      layout: {},
      spacing: {},
    },
    input: {
      id: 'input',
      kind: 'component',
      ref: { package: 'ui', component: 'TextField', version: '1' },
      props: {},
      children: [],
      layout: {},
      spacing: {},
    },
  },
  states: [],
  logic: { hooks: [], blocks: [] },
};

const forms: Form[] = [
  {
    id: 'f',
    screenId: 's',
    name: 'login',
    dynamic: false,
    fields: [
      {
        id: 'email',
        name: 'email',
        type: 'email',
        required: true,
        messages: { required: 'k' },
        nodeId: 'input',
      },
    ],
  },
];

const libraries = [
  {
    package: 'ui',
    components: [{ name: 'TextField', formBinding: { error: 'errorText' } }],
  },
] as unknown as LibraryPack[];

describe('withSimulatedErrors', () => {
  it('sets the error prop of the bound component to the field message', () => {
    const result = withSimulatedErrors(
      screen,
      forms,
      { email: true },
      libraries,
      { k: 'Obligatorio' },
      'Inv\u00e1lido',
    );
    expect(result.nodes.input).toMatchObject({
      props: { errorText: { type: 'literal', value: 'Obligatorio' } },
    });
    expect(screen.nodes.input).toMatchObject({ props: {} });
  });

  it('falls back to a generic message and reuses the result for the same input', () => {
    const first = withSimulatedErrors(
      screen,
      forms,
      { email: true },
      libraries,
      {},
      'Inv\u00e1lido',
    );
    expect(first.nodes.input).toMatchObject({ props: { errorText: { value: 'Inv\u00e1lido' } } });
    expect(
      withSimulatedErrors(screen, forms, { email: true }, libraries, {}, 'Inv\u00e1lido'),
    ).toBe(first);
  });

  it('returns the same screen when nothing is simulated or the pack has no error prop', () => {
    expect(withSimulatedErrors(screen, forms, {}, libraries, {}, 'x')).toBe(screen);
    expect(withSimulatedErrors(screen, forms, { email: true }, [], {}, 'x')).toBe(screen);
  });
});
