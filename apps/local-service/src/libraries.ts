import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError } from '@rnjb/core';
import { extractManifest, mergeManifest, type ManifestDiff } from '@rnjb/manifest-extractor';
import {
  libraryPackSchema,
  teamConfigSchema,
  type LibraryPack,
  type LocalSettings,
} from '@rnjb/pack-schema';
import semver from 'semver';
import { assertAbsoluteInside } from './paths.ts';
import { fetchSource } from './source-fetch.ts';
import type { Workspace } from './workspace.ts';

/** File name of a library pack: `@acme/ui` -> `acme-ui`. */
export const packIdOf = (pkg: string): string =>
  pkg
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export interface ExtractionResult {
  pack: LibraryPack;
  diff: ManifestDiff;
}

async function readTeamRange(workspace: Workspace, pkg: string): Promise<string | undefined> {
  const text = await workspace.read('rnjb.team.json').catch(() => undefined);
  if (!text) return undefined;
  const team = teamConfigSchema.safeParse(JSON.parse(text));
  return team.success
    ? team.data.libraries.find((entry) => entry.package === pkg)?.range
    : undefined;
}

/** Library packs stored in the workspace; files that do not validate are reported, not hidden. */
export async function listLibraryPacks(
  workspace: Workspace,
): Promise<{ packs: LibraryPack[]; invalid: { path: string }[] }> {
  const directory = path.join(workspace.root, 'packs/libraries');
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const packs: LibraryPack[] = [];
  const invalid: { path: string }[] = [];
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const relative = `packs/libraries/${name}`;
    try {
      const parsed = libraryPackSchema.safeParse(JSON.parse(await workspace.read(relative)));
      if (parsed.success) packs.push(parsed.data);
      else invalid.push({ path: relative });
    } catch {
      invalid.push({ path: relative });
    }
  }
  return { packs, invalid };
}

/** Resolves the configured source of `pkg` to a directory inside the browse root. */
export async function resolveSourceRoot(
  pkg: string,
  context: { settings: LocalSettings; browseRoot: string; cacheDir: string },
): Promise<string> {
  const source = context.settings.librarySources[pkg];
  if (!source) throw new RnjbError('RNJB-101', { package: pkg });
  if (source.type !== 'localPath') return fetchSource(pkg, source, context.cacheDir);
  return assertAbsoluteInside(context.browseRoot, source.path);
}

/**
 * Resolves the configured source of `pkg`, extracts its manifest (§7.1), merges it with the
 * stored pack so curated data survives (§7.2) and writes `packs/libraries/<id>.json`.
 */
export async function extractLibrary(
  pkg: string,
  context: {
    settings: LocalSettings;
    workspace: Workspace;
    browseRoot: string;
    cacheDir: string;
  },
): Promise<ExtractionResult> {
  const root = await resolveSourceRoot(pkg, context);
  const extracted = await extractManifest(root, { expectedPackage: pkg });

  const range = await readTeamRange(context.workspace, pkg);
  if (range && !semver.satisfies(extracted.packageVersion, range, { includePrerelease: true })) {
    throw new RnjbError('RNJB-103', { package: pkg, version: extracted.packageVersion, range });
  }

  const id = packIdOf(pkg);
  const relative = `packs/libraries/${id}.json`;
  const stored = await context.workspace
    .read(relative)
    .then((text) => libraryPackSchema.safeParse(JSON.parse(text)))
    .catch(() => undefined);
  const previous = stored?.success ? stored.data : undefined;
  const { components, diff } = mergeManifest(previous?.components ?? [], extracted.components);

  const pack: LibraryPack = {
    ...(previous ?? {}),
    schemaVersion: 1,
    kind: 'library',
    id,
    name: previous?.name ?? pkg,
    version: previous?.version ?? '1.0.0',
    package: pkg,
    packageVersion: extracted.packageVersion,
    components,
  };
  await context.workspace.write(relative, `${JSON.stringify(pack, null, 2)}\n`);
  return { pack, diff };
}
