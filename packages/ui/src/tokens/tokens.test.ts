import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './color.ts';
import { CONTRAST_PAIRS, generateCss, resolve } from './tokens.ts';

describe('design tokens', () => {
  it('generated CSS is up to date', () => {
    const file = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
    expect(file).toBe(generateCss());
  });

  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      it.each(CONTRAST_PAIRS)('$fg on $bg ≥ $min', ({ fg, bg, min }) => {
        const ratio = contrastRatio(resolve(theme, fg), resolve(theme, bg));
        expect(ratio, `${theme}: ${fg}/${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    });
  }
});
