import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROFILE_THRESHOLD,
  scoreProfiles,
  type Files,
  type ImportReport,
  type ProfileMatch,
} from '@rnjb/codegen';
import { PLATFORM_VERSION, RnjbError, createDocument } from '@rnjb/core';
import { FORMAT_VERSION, documentSchema, serializeRnjb } from '@rnjb/document-schema';
import { BUILT_IN_PROFILES } from '@rnjb/profiles';
import { toPosix } from './paths.ts';
import { git } from './source-fetch.ts';
import { offThread } from './off-thread.ts';
import type { Workspace } from './workspace.ts';

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 512 * 1024;

/**
 * Reads `package.json` and the TypeScript files under `src/`; nothing else leaves the folder.
 * Other files under `src/` are listed in `skipped` so the report can name them (§17.6).
 */
async function readRepository(root: string): Promise<{ files: Files; skipped: string[] }> {
  const files: Files = {};
  const skipped: string[] = [];
  const pkg = await fs.readFile(path.join(root, 'package.json'), 'utf8').catch(() => undefined);
  if (pkg !== undefined) files['package.json'] = pkg;
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      // Symlinks are skipped so an import cannot read outside the chosen folder.
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const relative = toPosix(path.relative(root, full));
        if (!/\.tsx?$/.test(entry.name) || (await fs.stat(full)).size > MAX_FILE_BYTES) {
          skipped.push(relative);
          continue;
        }
        if (Object.keys(files).length >= MAX_FILES) throw new RnjbError('RNJB-405', { path: root });
        files[relative] = await fs.readFile(full, 'utf8');
      }
    }
  };
  await walk(path.join(root, 'src')).catch((error: unknown) => {
    if (error instanceof RnjbError) throw error;
  });
  return { files, skipped: skipped.sort() };
}

export interface ImportResult {
  path: string;
  report: ImportReport;
  /** Files under `src/` the importer did not read: not TypeScript, or too large. */
  skipped: string[];
  /** Best profile match; below the threshold the default profile was used (§17.2). */
  profile: ProfileMatch & { threshold: number; detected: boolean };
  /** Every profile with its score, best first, so the user can pick another (§17.2). */
  profiles: ProfileMatch[];
  /** Profile the report was built with. */
  used: string;
  /** False on a dry run: the report is shown before anything is written (§17.5). */
  written: boolean;
}

export interface ImportInput {
  name: string;
  slug: string;
  /** Analyse only; nothing is written. */
  dryRun?: boolean;
  /** Profile chosen by the user; otherwise the detected one, or the default. */
  profileId?: string;
  /** Remote URL when the repository was cloned; a local folder uses its `origin`. */
  repository?: string;
}

/**
 * Where the import came from (§8), only when the folder is a git repository: the remote and the
 * commit are what a later export compares against. A local path never goes in the `.rnjb` (§2.3).
 */
async function importedFrom(root: string, given: string | undefined) {
  const commit = (await git(['rev-parse', 'HEAD'], root).catch(() => '')).trim();
  if (!commit) return undefined;
  const origin = (await git(['remote', 'get-url', 'origin'], root).catch(() => '')).trim();
  return { repository: given ?? (origin || path.basename(root)), commit };
}

/** Analyses a feature library and creates a journey from it. The repository is only read (§17). */
export async function importRepository(
  root: string,
  input: ImportInput,
  workspace: Workspace,
): Promise<ImportResult> {
  const { files, skipped } = await readRepository(root);
  const structure = { ...files, ...Object.fromEntries(skipped.map((file) => [file, ''])) };
  const profiles = scoreProfiles(structure, BUILT_IN_PROFILES);
  const [best] = profiles;
  const threshold =
    BUILT_IN_PROFILES.find((candidate) => candidate.id === best?.id)?.detection?.threshold ??
    PROFILE_THRESHOLD;
  const detected = best !== undefined && best.score >= threshold;
  const chosen =
    input.profileId === undefined
      ? undefined
      : BUILT_IN_PROFILES.find((candidate) => candidate.id === input.profileId);
  if (input.profileId !== undefined && !chosen)
    throw new RnjbError('RNJB-405', { path: 'profileId' });
  const profile =
    chosen ??
    ((detected && BUILT_IN_PROFILES.find((candidate) => candidate.id === best.id)) ||
      BUILT_IN_PROFILES[0]);
  if (!profile) throw new RnjbError('RNJB-405', { path: 'profile' });
  const { project, report } = await offThread('parseProject', { files, profile });
  if (project.screens.length === 0) throw new RnjbError('RNJB-404', { path: root });

  const origin = await importedFrom(root, input.repository);
  const document = {
    ...(origin && {
      provenance: {
        importedFrom: { ...origin, profile: { id: profile.id, version: profile.version } },
      },
    }),
    ...createDocument(
      {
        kind: 'journey',
        name: input.name,
        slug: input.slug,
        profile: { id: profile.id, version: profile.version },
        libraries: Object.entries(project.libraries).map(([pkg, version]) => ({
          package: pkg,
          version,
          packId: pkg,
        })),
        platformVersion: PLATFORM_VERSION,
        formatVersion: FORMAT_VERSION,
      },
      { now: () => new Date().toISOString() },
    ),
    screens: project.screens,
    connections: project.connections,
    strings: project.strings,
    data: { models: project.models, gateways: [], blocks: project.blocks },
    board: {
      positions: Object.fromEntries(
        project.screens.map((screen, index) => [screen.id, { x: index * 480, y: 0 }]),
      ),
      ...(project.initialScreenId ? { initialScreenId: project.initialScreenId } : {}),
    },
  };
  // Never write a journey that could not be opened again.
  const valid = documentSchema.safeParse(document);
  if (!valid.success)
    throw new RnjbError('RNJB-405', { path: String(valid.error.issues[0]?.path ?? '') });
  const file = `journeys/${input.slug}/${input.slug}.rnjb`;
  if (!input.dryRun) await workspace.write(file, await serializeRnjb(valid.data), true);
  const match = best ?? { id: profile.id, version: profile.version, score: 0 };
  return {
    path: file,
    report,
    skipped,
    profile: { ...match, threshold, detected },
    profiles,
    used: profile.id,
    written: !input.dryRun,
  };
}
