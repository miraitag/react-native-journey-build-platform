import { RnjbError, err, ok, type Result } from '@rnjb/core';
import { z } from 'zod';
import type { TeamConfig } from './config.ts';

const dependencyMap = z.record(z.string(), z.string()).optional();

const packageJsonSchema = z.looseObject({
  name: z.string().optional(),
  version: z.string().optional(),
  dependencies: dependencyMap,
  devDependencies: dependencyMap,
  peerDependencies: dependencyMap,
});

export interface PackageJsonImport {
  libraries: TeamConfig['libraries'];
  dependencyTemplate: NonNullable<TeamConfig['dependencyTemplate']>;
  /** Specifiers that point at local or workspace paths; never copied into shared config. */
  skipped: { package: string; specifier: string; file: 'library' | 'example' }[];
}

const LOCAL_SPECIFIER = /^(workspace:|file:|link:|portal:|\.{1,2}\/|\/)/;

function sortedPortable(
  map: Record<string, string> | undefined,
  file: 'library' | 'example',
  skipped: PackageJsonImport['skipped'],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of Object.keys(map ?? {}).sort()) {
    const specifier = (map ?? {})[name] as string;
    if (LOCAL_SPECIFIER.test(specifier)) skipped.push({ package: name, specifier, file });
    else result[name] = specifier;
  }
  return result;
}

/**
 * Proposes the team libraries and the profile dependency template from a feature library
 * `package.json` and its `example/package.json` (§7.6). Versions come only from the files.
 */
export function importPackageJson(library: unknown, example?: unknown): Result<PackageJsonImport> {
  const lib = packageJsonSchema.safeParse(library);
  if (!lib.success) return err(new RnjbError('RNJB-502', { file: 'package.json' }));
  const ex = example === undefined ? undefined : packageJsonSchema.safeParse(example);
  if (ex && !ex.success) return err(new RnjbError('RNJB-502', { file: 'example/package.json' }));

  const skipped: PackageJsonImport['skipped'] = [];
  const dependencies = sortedPortable(lib.data.dependencies, 'library', skipped);
  const devDependencies = sortedPortable(lib.data.devDependencies, 'library', skipped);
  const peerDependencies = sortedPortable(lib.data.peerDependencies, 'library', skipped);
  const exampleDependencies = ex?.success
    ? sortedPortable(ex.data.dependencies, 'example', skipped)
    : {};

  // Runtime libraries a journey can use: peer ranges are the contract, then direct dependencies.
  const ranges = new Map<string, string>();
  for (const [name, range] of Object.entries(dependencies)) ranges.set(name, range);
  for (const [name, range] of Object.entries(peerDependencies)) ranges.set(name, range);

  return ok({
    libraries: [...ranges.keys()]
      .sort()
      .map((name) => ({ package: name, range: ranges.get(name) as string })),
    dependencyTemplate: {
      library: { dependencies, devDependencies, peerDependencies },
      example: { dependencies: exampleDependencies },
    },
    skipped,
  });
}
