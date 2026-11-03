import { RnjbError, err, ok, type Result } from './errors.ts';

export const MAX_CATEGORY_DEPTH = 2;

export interface CategoryLike {
  id: string;
  parentId?: string;
}

/** Catalog categories allow at most two levels (§11.3), enforced here in the domain. */
export function validateCategories(categories: readonly CategoryLike[]): Result<true> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const category of categories) {
    let depth = 1;
    let parentId = category.parentId;
    const seen = new Set([category.id]);
    while (parentId !== undefined) {
      const parent = byId.get(parentId);
      if (!parent) return err(new RnjbError('RNJB-011', { id: category.id, parentId }));
      if (seen.has(parent.id)) return err(new RnjbError('RNJB-603', { id: category.id }));
      seen.add(parent.id);
      depth += 1;
      if (depth > MAX_CATEGORY_DEPTH) {
        return err(new RnjbError('RNJB-010', { id: category.id, max: MAX_CATEGORY_DEPTH }));
      }
      parentId = parent.parentId;
    }
  }
  return ok(true);
}
