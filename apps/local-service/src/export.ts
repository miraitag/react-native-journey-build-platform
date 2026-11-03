import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import * as prettier from 'prettier';
import {
  LOCK_PATH,
  buildLock,
  emitProject,
  planExport,
  type CheckResult,
  type ExportLock,
  type ExportPlanResult,
  type ExportScope,
  type EmitOptions,
  type Files,
  type MissingCodec,
} from '@rnjb/codegen';
import { PLATFORM_VERSION, RnjbError, escapeRegExp, type RnjbDocument } from '@rnjb/core';
import { sha256Hex } from '@rnjb/document-schema';
import { BUILT_IN_PROFILES } from '@rnjb/profiles';
import type { ProfilePack } from '@rnjb/pack-schema';
import { resolveInside, writeFileAtomic } from './paths.ts';

const run = promisify(execFile);

const profileFor = (document: RnjbDocument): ProfilePack => {
  const profile = BUILT_IN_PROFILES.find((candidate) => candidate.id === document.profile.id);
  if (!profile) throw new RnjbError('RNJB-405', { path: document.profile.id });
  return profile;
};

/** Formats with the target's own Prettier config when it has one, so a diff shows only real changes. */
async function format(files: Files, target: string | undefined): Promise<Files> {
  const out: Files = {};
  for (const [path, contents] of Object.entries(files)) {
    if (!/\.(tsx?|json)$/.test(path)) {
      out[path] = contents;
      continue;
    }
    const config = target
      ? await prettier.resolveConfig(await resolveInside(target, path)).catch(() => null)
      : null;
    try {
      out[path] = await prettier.format(contents, {
        singleQuote: true,
        trailingComma: 'all',
        ...config,
        filepath: path,
      });
    } catch {
      // shortcut: a file Prettier rejects is exported as emitted, with no warning, when to upgrade: report it in the plan
      out[path] = contents;
    }
  }
  return out;
}

const generate = async (
  document: RnjbDocument,
  scope: ExportScope,
  target?: string,
  options: EmitOptions = {},
): Promise<{ files: Files; missing: MissingCodec[]; profile: ProfilePack }> => {
  const profile = profileFor(document);
  const { files, missing } = emitProject(document, profile, options);
  const kept =
    scope === 'src'
      ? Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith('src/')))
      : files;
  return { files: await format(kept, target), missing, profile };
};

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

const readIfExists = async (file: string): Promise<string | undefined> =>
  fs.readFile(file, 'utf8').catch(() => undefined);

async function readLock(target: string): Promise<ExportLock | undefined> {
  const text = await readIfExists(await resolveInside(target, LOCK_PATH));
  if (text === undefined) return undefined;
  try {
    const lock = JSON.parse(text) as ExportLock;
    return lock.version === 1 && typeof lock.files === 'object' ? lock : undefined;
  } catch {
    return undefined;
  }
}

/** `git show` of each file at the last commit that changed the lock (§16.3). */
async function gitBase(target: string, paths: string[]): Promise<Files | undefined> {
  const prefix = (await git(target, ['rev-parse', '--show-prefix']))?.trim();
  if (prefix === undefined) return undefined;
  const commit = (
    await git(target, ['log', '-1', '--format=%H', '--', `${prefix}${LOCK_PATH}`])
  )?.trim();
  if (!commit) return undefined;
  const base: Files = {};
  for (const path of paths) {
    const contents = await git(target, ['show', `${commit}:${prefix}${path}`]);
    if (contents !== undefined) base[path] = contents;
  }
  return base;
}

export async function planDocumentExport(
  document: RnjbDocument,
  target: string | undefined,
  scope: ExportScope,
  options: EmitOptions = {},
): Promise<ExportPlanResult> {
  const { files, missing } = await generate(document, scope, target, options);
  const none = { git: false, dirty: false, hasLock: false, onDisk: {} };
  if (missing.length > 0) return { missing, plan: { entries: [], stale: [] }, ...none };

  /** A folder that does not exist yet: everything is new. */
  if (target === undefined) {
    const plan = await planExport({ generated: files, current: {}, hash: sha256Hex });
    return { missing, plan, ...none };
  }

  const current = await readCurrent(target, files);
  const onDisk: Record<string, string> = {};
  for (const [path, contents] of Object.entries(current)) onDisk[path] = await sha256Hex(contents);
  const lock = await readLock(target);
  const inGit = (await git(target, ['rev-parse', '--is-inside-work-tree']))?.trim() === 'true';
  const base = inGit ? await gitBase(target, Object.keys(current)) : undefined;
  const dirty = inGit && ((await git(target, ['status', '--porcelain']))?.trim() ?? '') !== '';

  const plan = await planExport({
    generated: files,
    current,
    ...(base ? { base } : {}),
    ...(lock ? { lock } : {}),
    hash: sha256Hex,
  });
  return { missing, plan, git: inGit, dirty, hasLock: lock !== undefined, onDisk };
}

async function readCurrent(target: string, files: Files): Promise<Files> {
  const current: Files = {};
  for (const path of Object.keys(files)) {
    const contents = await readIfExists(await resolveInside(target, path));
    if (contents !== undefined) current[path] = contents;
  }
  return current;
}

/**
 * Writes the files the user confirmed. Only paths the exporter itself generates are accepted, so
 * a request cannot write elsewhere; `resolveInside` still checks each one (ADR 0004).
 */
export async function applyDocumentExport(
  document: RnjbDocument,
  target: string,
  scope: ExportScope,
  chosen: Files,
  onDisk: Record<string, string>,
  options: EmitOptions = {},
): Promise<{ written: string[] }> {
  const { files, missing, profile } = await generate(document, scope, target, options);
  if (missing.length > 0) throw new RnjbError('RNJB-405', { path: 'missing codecs' });
  const current = await readCurrent(target, files);
  // All checked before any write, so a file edited during the review never gets overwritten.
  for (const path of Object.keys(chosen)) {
    if (!Object.hasOwn(files, path)) throw new RnjbError('RNJB-403', { path });
    const now = Object.hasOwn(current, path) ? await sha256Hex(current[path] as string) : undefined;
    if (now !== (Object.hasOwn(onDisk, path) ? onDisk[path] : undefined))
      throw new RnjbError('RNJB-208', { path });
  }
  const written: string[] = [];
  for (const [path, contents] of Object.entries(chosen)) {
    if (current[path] === contents) continue;
    await writeFileAtomic(await resolveInside(target, path), contents);
    written.push(path);
  }
  const lock = await buildLock(
    files,
    {
      document: document.integrity,
      profile: { id: profile.id, version: profile.version },
      platformVersion: PLATFORM_VERSION,
    },
    sha256Hex,
  );
  await writeFileAtomic(
    await resolveInside(target, LOCK_PATH),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  return { written };
}

/**
 * Where the team skills live (§6.2): installed in the project (`.github/skills`, per their README),
 * else the folder in settings, else the personal install (`~/.copilot/skills`).
 */
async function skillsRoot(target: string, configured: string | undefined): Promise<string> {
  const project = path.join(target, '.github', 'skills');
  if (
    await fs.stat(project).then(
      (stat) => stat.isDirectory(),
      () => false,
    )
  )
    return project;
  return configured ?? path.join(os.homedir(), '.copilot', 'skills');
}

/**
 * Expands the one `*` folder of a scanner path (`*architecture*` under `{skills}`), so a profile
 * names a kind of skill, not a team's skill. Lists every installed match.
 */
async function expandSkill(file: string): Promise<string[]> {
  const parts = file.split(/[\\/]/);
  const at = parts.findIndex((part) => part.includes('*'));
  if (at < 0) return [file];
  const parent = parts.slice(0, at).join(path.sep);
  const pattern = new RegExp(`^${(parts[at] as string).split('*').map(escapeRegExp).join('.*')}$`);
  const names = await fs.readdir(parent).catch(() => []);
  const found = [];
  for (const name of names.filter((candidate) => pattern.test(candidate)).sort()) {
    const candidate = [parent, name, ...parts.slice(at + 1)].join(path.sep);
    if (
      await fs.stat(candidate).then(
        () => true,
        () => false,
      )
    )
      found.push(candidate);
  }
  return found;
}

/** Runs the profile's checks on the chosen folder, only when the user asks (§16.4). */
export async function runChecks(
  document: RnjbDocument,
  target: string,
  skillsPath?: string,
): Promise<CheckResult[]> {
  const { checks } = profileFor(document).conventions;
  const skills = await skillsRoot(target, skillsPath);
  const results: CheckResult[] = [];
  for (const check of checks) {
    const base = { id: check.id, description: check.description ?? check.id };
    const parts = [];
    let missing: string | undefined;
    for (const part of check.command) {
      if (!part.includes('{skills}')) {
        parts.push(part);
        continue;
      }
      const wanted = part.replaceAll('{skills}', skills);
      const found = await expandSkill(wanted);
      // A scanner that is not installed (or not told apart) is reported, not a failure of the code.
      if (found.length !== 1) missing = found.length === 0 ? wanted : found.join('\n');
      else parts.push(found[0] as string);
    }
    const [command, ...args] = parts;
    if (!command) continue;
    if (missing !== undefined) {
      results.push({ ...base, ok: false, skipped: true, output: missing });
      continue;
    }
    try {
      const { stdout, stderr } = await run(command, args, {
        cwd: target,
        timeout: 5 * 60_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const output = `${stdout}${stderr}`;
      const failed = check.failsWhen !== undefined && new RegExp(check.failsWhen, 'm').test(output);
      results.push({ ...base, ok: !failed, output: output.slice(-8000) });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; message: string };
      results.push({
        ...base,
        ok: false,
        output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` || failure.message,
      });
    }
  }
  return results;
}
