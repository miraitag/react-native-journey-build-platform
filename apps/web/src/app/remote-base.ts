import { computeIntegrity } from '@rnjb/document-schema';
import type { RnjbDocument } from '@rnjb/core';

/**
 * Hash of a document without its provenance. A copy of a remote item records it as `base`, so a
 * later difference means the copy was edited (§6.4: «Reemplazar» only without local changes).
 */
export async function baseOf(document: RnjbDocument): Promise<string> {
  const { provenance: _provenance, ...content } = document;
  return computeIntegrity(content);
}
