import type { RnjbDocument } from '@rnjb/core';
import { canonicalStringify } from './canonical.ts';

const INTEGRITY_PREFIX = 'sha256-';

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of the canonical serialization without the `integrity` field. */
export async function computeIntegrity(
  document: RnjbDocument | Record<string, unknown>,
): Promise<string> {
  const { integrity: _ignored, ...rest } = document as Record<string, unknown>;
  return INTEGRITY_PREFIX + (await sha256Hex(canonicalStringify(rest)));
}

export async function verifyIntegrity(document: RnjbDocument): Promise<boolean> {
  return document.integrity === (await computeIntegrity(document));
}
