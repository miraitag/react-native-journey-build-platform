import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError, type WorkspaceEntry } from '@rnjb/core';
import { gitUrlSchema, type RemoteSource } from '@rnjb/pack-schema';
import { resolveInside } from './paths.ts';
import { GIT_REF, exists, git, keyOf } from './source-fetch.ts';
import { Workspace } from './workspace.ts';

/**
 * Remote sources are read-only (§6.4): a shallow, sparse, blob-less clone in the cache. The
 * machine's own git credentials do the authentication; nothing is asked for or stored.
 *
 * The history is kept to `HISTORY_DEPTH` commits, not 1 as the ADR first said, so each file gets
 * the last commit that touched it: that is what tells "update available" apart from an unrelated
 * commit elsewhere in the repository.
 */
const HISTORY_DEPTH = '50';
const SPARSE_PATTERNS = ['*.rnjb', '/packs/', '/rnjb.team.json'];
const ENTRY_FILE = /^(journeys|templates)\/[^/]+\/[^/]+\.rnjb$/;

export interface SyncOptions {
  /** Tests only: lets git read a `file://` repository. The service never sets it. */
  allowFile?: boolean;
}

export interface SyncedRemote {
  /** Commit the clone is at. */
  commit: string;
  /** The cached copy is shown because the remote could not be reached. */
  stale: boolean;
  entries: WorkspaceEntry[];
}

function checkSource(source: RemoteSource, options: SyncOptions): void {
  const urlOk =
    gitUrlSchema.safeParse(source.remote).success ||
    (options.allowFile === true && source.remote.startsWith('file://'));
  if (!urlOk) throw new RnjbError('RNJB-105', { url: source.remote });
  if (!GIT_REF.test(source.ref)) throw new RnjbError('RNJB-108', { name: source.name });
}

const cloneDir = (source: RemoteSource, cacheDir: string): string =>
  path.join(cacheDir, 'remotes', keyOf(`${source.remote}#${source.ref}`));

async function refresh(
  source: RemoteSource,
  target: string,
  options: SyncOptions,
): Promise<boolean> {
  try {
    if (await exists(path.join(target, '.git'))) {
      await git(['fetch', '--depth', HISTORY_DEPTH, 'origin', source.ref], target, options);
      await git(['reset', '--hard', 'FETCH_HEAD'], target, options);
      return false;
    }
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await git(
      [
        'clone',
        '--depth',
        HISTORY_DEPTH,
        '--filter=blob:none',
        '--no-checkout',
        '--branch',
        source.ref,
        '--',
        source.remote,
        target,
      ],
      undefined,
      options,
    );
    await git(['sparse-checkout', 'set', '--no-cone', ...SPARSE_PATTERNS], target, options);
    await git(['reset', '--hard', 'HEAD'], target, options);
    return false;
  } catch (cause) {
    // An existing clone survives a failed refresh (offline); a failed first clone leaves nothing.
    if (await exists(path.join(target, '.git'))) return true;
    await fs.rm(target, { recursive: true, force: true });
    throw new RnjbError('RNJB-108', { name: source.name }, { cause });
  }
}

const folderRoot = (source: RemoteSource, target: string): Promise<string> =>
  source.path ? resolveInside(target, source.path) : Promise.resolve(target);

export async function syncRemote(
  source: RemoteSource,
  cacheDir: string,
  options: SyncOptions = {},
): Promise<SyncedRemote> {
  checkSource(source, options);
  const target = cloneDir(source, cacheDir);
  const stale = await refresh(source, target, options);
  const head = (await git(['rev-parse', 'HEAD'], target, options)).trim();

  const root = await folderRoot(source, target);
  const { entries } = await new Workspace(root).index();
  const result: WorkspaceEntry[] = [];
  for (const entry of entries) {
    const repoPath = path.posix.join(source.path, entry.path);
    const last = (
      await git(['log', '-1', '--format=%H', '--', repoPath], target, options).catch(() => '')
    ).trim();
    result.push({
      ...entry,
      origin: 'remote',
      remote: { remote: source.remote, ref: source.ref, path: repoPath, commit: last || head },
    });
  }
  return { commit: head, stale, entries: result };
}

/** Reads one journey or template of a source, for the copy that opening it creates. */
export async function readRemoteFile(
  source: RemoteSource,
  cacheDir: string,
  relative: string,
): Promise<string> {
  if (!ENTRY_FILE.test(relative)) throw new RnjbError('RNJB-403', { path: relative });
  const target = cloneDir(source, cacheDir);
  if (!(await exists(path.join(target, '.git'))))
    throw new RnjbError('RNJB-404', { path: relative });
  return new Workspace(await folderRoot(source, target)).read(relative);
}
