import { describe, expect, it } from 'vitest';
import { applyBasicJourney } from './basic-journey.ts';
import { createDocument, type CommandContext } from './commands.ts';

describe('applyBasicJourney', () => {
  it('adds three chained screens with the first one as initial', () => {
    let n = 0;
    const ctx: CommandContext = {
      ids: { next: () => `id${++n}` },
      clock: { now: () => '2026-01-01T00:00:00.000Z' },
    };
    const empty = createDocument(
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
    const doc = applyBasicJourney(
      empty,
      { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: ['success', 'error'] },
      ctx,
    );
    expect(doc.screens.map((screen) => screen.name)).toEqual(['Inicio', 'Detalle', 'Resultado']);
    expect(doc.screens.every((screen) => screen.states.length === 2)).toBe(true);
    expect(doc.board.initialScreenId).toBe(doc.screens[0]?.id);
    expect(doc.connections.map((c) => [c.fromScreenId, c.toScreenId])).toEqual([
      [doc.screens[0]?.id, doc.screens[1]?.id],
      [doc.screens[1]?.id, doc.screens[2]?.id],
    ]);
    const xs = doc.screens.map((screen) => doc.board.positions[screen.id]?.x ?? 0);
    expect(xs[0]).toBeLessThan(xs[1] as number);
  });
});
