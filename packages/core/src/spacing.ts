/**
 * Snaps `value` to the nearest step of the pack's spacing scale (§11.7). Without a scale the
 * value is free. Ties go to the smaller step.
 */
export function snapToScale(value: number, scale: readonly number[] | undefined): number {
  if (!scale || scale.length === 0) return value;
  let best = scale[0]!;
  for (const step of scale) {
    const distance = Math.abs(step - value);
    const bestDistance = Math.abs(best - value);
    if (distance < bestDistance || (distance === bestDistance && step < best)) best = step;
  }
  return best;
}

/** Parses spacing text: a finite, non-negative number; `undefined` otherwise. */
export function parseSpacingInput(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
