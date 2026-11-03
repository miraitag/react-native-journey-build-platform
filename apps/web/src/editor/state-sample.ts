import type { JsonValue } from '@rnjb/core';

export type SampleParse =
  { ok: true; sample: Record<string, JsonValue> } | { ok: false; reason: 'syntax' | 'notObject' };

/** The sample of a state is a JSON object (§9.3); anything else is rejected with its reason. */
export function parseSampleJson(text: string): SampleParse {
  let value: unknown;
  try {
    value = JSON.parse(text.trim() === '' ? '{}' : text);
  } catch {
    return { ok: false, reason: 'syntax' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'notObject' };
  }
  return { ok: true, sample: value as Record<string, JsonValue> };
}

export const sampleToJson = (sample: Record<string, JsonValue>): string =>
  Object.keys(sample).length === 0 ? '{}' : JSON.stringify(sample, null, 2);
