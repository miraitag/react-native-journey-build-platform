import { RnjbError, err, ok, type Result } from './errors.ts';

export const SLUG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;

export interface SlugOptions {
  /** Prefixes the profile adds to derived names; typed by mistake, they are removed (§9.2). */
  prefixes?: readonly string[];
  /** Slugs already used in the workspace. */
  existing?: Iterable<string>;
}

export interface NormalizedSlug {
  slug: string;
  warnings: RnjbError[];
}

export function normalizeSlug(input: string, options: SlugOptions = {}): Result<NormalizedSlug> {
  let slug = input.trim();
  const warnings: RnjbError[] = [];

  const prefix = [...(options.prefixes ?? [])]
    .filter((candidate) => candidate.length > 0)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => slug.startsWith(candidate));
  if (prefix !== undefined && slug.length > prefix.length) {
    slug = slug.slice(prefix.length);
    warnings.push(new RnjbError('RNJB-003', { prefix }));
  }

  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug)) {
    return err(new RnjbError('RNJB-001', { slug, min: SLUG_MIN_LENGTH, max: SLUG_MAX_LENGTH }));
  }

  for (const used of options.existing ?? []) {
    if (used === slug) return err(new RnjbError('RNJB-002', { slug }));
  }

  return ok({ slug, warnings });
}

const words = (slug: string): string[] => slug.split('-').filter(Boolean);

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export const toPascalCase = (slug: string): string => words(slug).map(capitalize).join('');

export const toCamelCase = (slug: string): string => {
  const pascal = toPascalCase(slug);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

export const toConstantCase = (slug: string): string => words(slug).join('_').toUpperCase();

const PLACEHOLDERS: Record<string, (slug: string) => string> = {
  slug: (slug) => slug,
  Pascal: toPascalCase,
  camel: toCamelCase,
  CONSTANT: toConstantCase,
};

/** Expands a profile name template such as `{Pascal}Navigator`. Unknown placeholders are kept. */
export function expandNameTemplate(template: string, slug: string): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const transform = PLACEHOLDERS[key];
    return transform ? transform(slug) : match;
  });
}

export function deriveNames<K extends string>(
  slug: string,
  templates: Readonly<Record<K, string>>,
): Record<K, string> {
  const result = {} as Record<K, string>;
  for (const key of Object.keys(templates) as K[]) {
    result[key] = expandNameTemplate(templates[key], slug);
  }
  return result;
}

/** Literal text a template places before `{slug}`, e.g. `react-native-acme-`. */
export function slugPrefixesFromTemplates(templates: Iterable<string>): string[] {
  const prefixes = new Set<string>();
  for (const template of templates) {
    const index = template.indexOf('{slug}');
    if (index <= 0) continue;
    const before = template.slice(0, index);
    if (before.includes('{')) continue;
    // A scoped package contributes both the full prefix and the part after the scope.
    prefixes.add(before);
    const slash = before.lastIndexOf('/');
    if (slash >= 0 && slash < before.length - 1) prefixes.add(before.slice(slash + 1));
  }
  return [...prefixes];
}

/** `text` as a literal inside a regular expression. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
