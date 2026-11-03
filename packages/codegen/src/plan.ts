import type { MissingCodec } from './emit.ts';
import { merge3 } from './merge3.ts';

/** Virtual file tree: POSIX path relative to the export root -> contents. */
export type Files = Record<string, string>;

export const LOCK_PATH = '.rnjb/export.lock.json';

export interface ExportLock {
  version: 1;
  /** Integrity checksum of the `.rnjb` that was exported. */
  document: string;
  profile: { id: string; version: string };
  platformVersion: string;
  /** Hash of each generated file, as written. */
  files: Record<string, string>;
}

export type ExportStatus =
  /** The file does not exist at the destination. */
  | 'new'
  /** Disk already has what would be written. */
  | 'unchanged'
  /** The file was not touched by hand since the last export, or only we changed it. */
  | 'update'
  /** Both sides changed and the changes merge cleanly. */
  | 'merged'
  /** Both sides changed the same lines; a person must decide. */
  | 'conflict';

export interface ExportEntry {
  path: string;
  status: ExportStatus;
  ours: string;
  /** What is on disk, when the file exists. */
  theirs?: string;
  /** What will be written by default. Conflicts carry git-style markers. */
  proposed: string;
  /** `true` when there was no base and the comparison is between two versions only. */
  twoWay: boolean;
}

export interface ExportPlan {
  entries: ExportEntry[];
  /** Files of the previous export that the new one no longer generates. They are never deleted. */
  stale: string[];
}

export interface PlanInput {
  generated: Files;
  /** Files currently on disk, for the generated paths that exist. */
  current: Files;
  /** The base of each file (`git show` of the commit that last changed the lock). */
  base?: Files;
  lock?: ExportLock;
  hash: (text: string) => Promise<string>;
}

export async function planExport(input: PlanInput): Promise<ExportPlan> {
  const entries: ExportEntry[] = [];
  for (const path of Object.keys(input.generated).sort()) {
    const ours = input.generated[path] as string;
    const theirs = input.current[path];
    if (theirs === undefined) {
      entries.push({ path, status: 'new', ours, proposed: ours, twoWay: false });
      continue;
    }
    if (theirs === ours) {
      entries.push({ path, status: 'unchanged', ours, theirs, proposed: ours, twoWay: false });
      continue;
    }

    // Disk still holds the last export (even one not committed yet): nothing to merge.
    const locked = input.lock?.files[path];
    if (locked !== undefined && locked === (await input.hash(theirs))) {
      entries.push({ path, status: 'update', ours, theirs, proposed: ours, twoWay: false });
      continue;
    }

    const base = input.base?.[path];
    if (base !== undefined) {
      const merged = merge3(base, ours, theirs);
      entries.push({
        path,
        status: merged.conflicts > 0 ? 'conflict' : 'merged',
        ours,
        theirs,
        proposed: merged.text,
        twoWay: false,
      });
      continue;
    }

    const merged = merge3('', ours, theirs);
    entries.push({ path, status: 'conflict', ours, theirs, proposed: merged.text, twoWay: true });
  }

  const stale = Object.keys(input.lock?.files ?? {})
    .filter((path) => !(path in input.generated))
    .sort();
  return { entries, stale };
}

export async function buildLock(
  files: Files,
  meta: Omit<ExportLock, 'version' | 'files'>,
  hash: (text: string) => Promise<string>,
): Promise<ExportLock> {
  const hashes: Record<string, string> = {};
  for (const path of Object.keys(files).sort()) hashes[path] = await hash(files[path] as string);
  return { version: 1, ...meta, files: hashes };
}

/** What is exported: the whole library project or only its `src/`. */
export type ExportScope = 'project' | 'src';

/** The local service's answer to an export plan request (§16.1). */
export interface ExportPlanResult {
  /** Present when nothing can be exported; the plan is then empty. */
  missing: MissingCodec[];
  plan: ExportPlan;
  git: boolean;
  /** The repository has changes that are not committed. */
  dirty: boolean;
  hasLock: boolean;
  /** Hash of each file as read for the plan; apply refuses a file that changed since. */
  onDisk: Record<string, string>;
}

/** One profile check after an export (§16.4). */
export interface CheckResult {
  id: string;
  description: string;
  ok: boolean;
  /** The check could not run here (a scanner that is not installed); `output` says where it looked. */
  skipped?: boolean;
  output: string;
}
