import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_SIZE, boardScale } from './board-geometry.ts';

describe('boardScale', () => {
  it('keeps the default size and spreads larger frames so saved positions never overlap', () => {
    expect(boardScale(DEFAULT_FRAME_SIZE)).toBe(1);
    expect(boardScale({ width: 300, height: 600 })).toBe(1);
    // Default positions are 480 apart: an 874-wide landscape frame needs them further apart.
    const scale = boardScale({ width: 874, height: 402 });
    expect(480 * scale).toBeGreaterThan(874);
  });
});
