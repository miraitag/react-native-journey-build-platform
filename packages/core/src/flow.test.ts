import { describe, expect, it } from 'vitest';
import { applyBasicJourney } from './basic-journey.ts';
import { addConnection, applyCommand, createDocument, type CommandContext } from './commands.ts';
import type { RnjbDocument } from './entities.ts';
import { flowTree, nestScreen } from './flow.ts';

let n = 0;
const ctx: CommandContext = {
  ids: { next: () => `id${++n}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};
const basic = applyBasicJourney(
  createDocument(
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
  ),
  { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: [] },
  ctx,
);
const [inicio, detalle, resultado] = basic.screens.map((screen) => screen.id) as [
  string,
  string,
  string,
];
const run = (doc: RnjbDocument, command: Parameters<typeof applyCommand>[1]) =>
  applyCommand(doc, command, ctx).document;
const outline = (doc: RnjbDocument) =>
  flowTree(doc).map((row) => `${'  '.repeat(row.depth)}${row.reference ? '>' : ''}${row.screenId}`);

describe('flowTree', () => {
  it('nests each screen under the one that navigates to it, from the initial screen', () => {
    expect(outline(basic)).toEqual([inicio, `  ${detalle}`, `    ${resultado}`]);
  });

  it('shows a loop back, and a second way in, as references', () => {
    const looped = run(
      basic,
      addConnection({ fromScreenId: resultado, toScreenId: inicio, params: [] }),
    );
    expect(outline(looped)).toEqual([
      inicio,
      `  ${detalle}`,
      `    ${resultado}`,
      `      >${inicio}`,
    ]);
    expect(flowTree(looped).at(-1)).toMatchObject({ reference: true, parentId: resultado });
  });

  it('names the element that triggers a navigation', () => {
    const root = basic.screens[0]!.rootId;
    const doc = run(
      basic,
      addConnection({
        fromScreenId: inicio,
        toScreenId: resultado,
        triggerNodeId: root,
        params: [],
      }),
    );
    expect(
      flowTree(doc).find((row) => row.parentId === inicio && row.screenId === resultado)?.trigger,
    ).toBeDefined();
  });
});

describe('nestScreen', () => {
  it('moves a screen: the old navigation without trigger goes, the new one is added', () => {
    const doc = run(basic, nestScreen(resultado, inicio));
    expect(outline(doc)).toEqual([inicio, `  ${detalle}`, `  ${resultado}`]);
    expect(doc.connections.filter((c) => c.toScreenId === resultado)).toHaveLength(1);
  });

  it('takes a screen to the top level, and never drops a navigation fired by an element', () => {
    const root = basic.screens[1]!.rootId;
    const triggered = run(
      basic,
      addConnection({
        fromScreenId: detalle,
        toScreenId: resultado,
        triggerNodeId: root,
        params: [],
      }),
    );
    const doc = run(triggered, nestScreen(resultado, undefined));
    expect(doc.connections.filter((c) => c.toScreenId === resultado)).toEqual([
      expect.objectContaining({ fromScreenId: detalle, triggerNodeId: root }),
    ]);
    expect(() => run(basic, nestScreen(inicio, inicio))).toThrow(
      expect.objectContaining({ code: 'RNJB-603' }),
    );
  });

  it('moves a screen out of the top level even when its new parent comes later in the list', () => {
    const loose = run(basic, (draft) => {
      draft.connections = [];
    });
    const doc = run(loose, nestScreen(detalle, resultado));
    expect(outline(doc)).toEqual([inicio, resultado, `  ${detalle}`]);
  });
});
