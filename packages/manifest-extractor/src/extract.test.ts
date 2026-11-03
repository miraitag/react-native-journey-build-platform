import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ComponentManifest } from '@rnjb/pack-schema';
import { componentManifestSchema } from '@rnjb/pack-schema';
import { extractManifest, mergeManifest } from './index.ts';

let root: string;

async function put(file: string, contents: string): Promise<void> {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rnjb-extract-'));
  await put(
    'package.json',
    JSON.stringify({ name: '@acme/ui', version: '2.3.1', source: 'src/index.ts' }),
  );
  await put(
    'src/index.ts',
    `export { Button } from './components/button/Button';
export { Card } from './components/card/Card';
export { Badge } from './components/badge/Badge';
export { Legacy } from './components/legacy/Legacy';
export { formatPrice } from './utils';
export { THEME } from './theme';
export type { ButtonProps } from './components/button/Button';
`,
  );
  await put(
    'src/components/button/Button.tsx',
    `import type { ReactNode } from 'react';
export interface ButtonProps {
  /** Visual weight. */
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 1 | 2 | 3;
  label: string;
  loading?: boolean;
  count?: number;
  icon?: ReactNode;
  onPress?: () => void;
  style?: { margin: number };
  children?: ReactNode;
}
export function Button({ variant = 'primary', loading = false, size = 2, count = -1 }: ButtonProps) {
  return null;
}
`,
  );
  await put(
    'src/components/card/Card.tsx',
    `export interface CardProps { title: string; elevated?: boolean }
export const Card = memoLike(({ elevated = true }: CardProps) => null);
declare function memoLike<T>(fn: T): T;
`,
  );
  await put(
    'src/components/badge/Badge.tsx',
    `export const Badge = () => null;
`,
  );
  await put(
    'src/components/legacy/Legacy.tsx',
    `export interface LegacyProps { tone?: 'a' | 'b' }
export class Legacy {
  props!: LegacyProps;
}
`,
  );
  await put(
    'src/utils.ts',
    `export function Format(value: number): string { return String(value); }\nexport function formatPrice(v: number) { return v; }\n`,
  );
  await put('src/theme.ts', `export const THEME = { dark: true };\n`);
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('extractManifest', () => {
  it('reads package identity and entry', async () => {
    const result = await extractManifest(root);
    expect(result).toMatchObject({
      package: '@acme/ui',
      packageVersion: '2.3.1',
      entry: 'src/index.ts',
    });
  });

  it('lists exported components only, sorted, and validates against the pack schema', async () => {
    const { components } = await extractManifest(root);
    expect(components.map((component) => component.name)).toEqual([
      'Badge',
      'Button',
      'Card',
      'Legacy',
    ]);
    for (const component of components)
      expect(componentManifestSchema.safeParse(component).success).toBe(true);
  });

  it('classifies props, options, optionality and defaults', async () => {
    const button = (await extractManifest(root)).components.find((c) => c.name === 'Button');
    const props = Object.fromEntries((button?.props ?? []).map((prop) => [prop.name, prop]));
    expect(props.variant).toMatchObject({
      kind: 'enum',
      options: ['primary', 'secondary', 'ghost'],
      optional: true,
      default: 'primary',
    });
    expect(props.size).toMatchObject({ kind: 'enum', options: [1, 2, 3], default: 2 });
    expect(props.label).toMatchObject({ kind: 'string', optional: false });
    expect(props.loading).toMatchObject({ kind: 'boolean', default: false });
    expect(props.count).toMatchObject({ kind: 'number', default: -1 });
    expect(props.icon).toMatchObject({ kind: 'node' });
    expect(props.onPress).toMatchObject({ kind: 'function', optional: true });
    expect(props.style).toMatchObject({ kind: 'object' });
    expect(button?.variantProps).toEqual(['size', 'variant']);
    expect(button?.nesting).toEqual({ acceptsChildren: true });
    expect(button?.category).toBe('button');
  });

  it('handles wrapped, prop-less and class components', async () => {
    const byName = Object.fromEntries(
      (await extractManifest(root)).components.map((component) => [component.name, component]),
    );
    expect(byName.Card?.props.find((prop) => prop.name === 'elevated')).toMatchObject({
      kind: 'boolean',
      default: true,
    });
    expect(byName.Badge?.props).toEqual([]);
    expect(byName.Legacy?.props[0]).toMatchObject({ name: 'tone', kind: 'enum' });
  });

  it('is deterministic across runs (cached parse)', async () => {
    expect(await extractManifest(root)).toEqual(await extractManifest(root));
  });

  it('rejects a package name mismatch (RNJB-102) and a missing entry (RNJB-104)', async () => {
    await expect(extractManifest(root, { expectedPackage: '@acme/other' })).rejects.toMatchObject({
      code: 'RNJB-102',
    });
    const empty = await mkdtemp(path.join(os.tmpdir(), 'rnjb-extract-empty-'));
    await writeFile(
      path.join(empty, 'package.json'),
      JSON.stringify({ name: 'x', version: '1.0.0' }),
    );
    await expect(extractManifest(empty)).rejects.toMatchObject({ code: 'RNJB-104' });
    await rm(empty, { recursive: true, force: true });
    await expect(extractManifest(path.join(root, 'nope'))).rejects.toMatchObject({
      code: 'RNJB-101',
    });
  });

  it('refuses an entry that escapes the library folder', async () => {
    const bad = await mkdtemp(path.join(os.tmpdir(), 'rnjb-extract-bad-'));
    await writeFile(
      path.join(bad, 'package.json'),
      JSON.stringify({ name: 'x', version: '1.0.0', source: '../../etc/passwd' }),
    );
    await expect(extractManifest(bad)).rejects.toMatchObject({ code: 'RNJB-403' });
    await rm(bad, { recursive: true, force: true });
  });
});

describe('mergeManifest', () => {
  const prop = (name: string, extra: Partial<ComponentManifest['props'][number]> = {}) => ({
    name,
    type: 'string',
    kind: 'string' as const,
    optional: true,
    origin: 'extracted' as const,
    ...extra,
  });
  const component = (
    name: string,
    props: ComponentManifest['props'],
    extra: Partial<ComponentManifest> = {},
  ): ComponentManifest => ({ name, origin: 'extracted', props, ...extra });

  it('reports added, removed and changed, and keeps curated data', () => {
    const previous = [
      component(
        'Button',
        [prop('label'), prop('old'), prop('tone', { origin: 'curated', kind: 'enum' })],
        {
          formBinding: { value: 'value' },
          editableTextProps: ['label'],
        },
      ),
      component('Gone', [prop('x')]),
      component('Kept', [prop('y')], { origin: 'curated' }),
    ];
    const extracted = [
      component('Button', [
        prop('label', { type: 'number', kind: 'number' }),
        prop('fresh'),
        prop('tone'),
      ]),
      component('New', []),
    ];
    const { components, diff } = mergeManifest(previous, extracted);
    expect(diff.addedComponents).toEqual(['New']);
    expect(diff.removedComponents).toEqual(['Gone', 'Kept']);
    expect(diff.changedComponents).toEqual([
      // `tone` differs from what the library now declares; the curated value is kept.
      {
        name: 'Button',
        addedProps: ['fresh'],
        removedProps: ['old'],
        changedProps: ['label', 'tone'],
      },
    ]);
    expect(components.map((c) => c.name)).toEqual(['Button', 'Kept', 'New']);
    const button = components.find((c) => c.name === 'Button');
    expect(button?.formBinding).toEqual({ value: 'value' });
    expect(button?.editableTextProps).toEqual(['label']);
    expect(button?.props.find((p) => p.name === 'tone')?.origin).toBe('curated');
    expect(button?.props.map((p) => p.name)).toEqual(['fresh', 'label', 'tone']);
  });

  it('a fully curated component is never overwritten', () => {
    const curated = component('Box', [prop('a')], { origin: 'curated' });
    const { components, diff } = mergeManifest(
      [curated],
      [component('Box', [prop('a'), prop('b')])],
    );
    expect(components).toEqual([curated]);
    expect(diff.changedComponents[0]?.addedProps).toEqual(['b']);
  });
});
