import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { RnjbError } from '@rnjb/core';
import { gitUrlSchema, type LibrarySource } from '@rnjb/pack-schema';
import semver from 'semver';

const run = promisify(execFile);
const TIMEOUT_MS = 120_000;
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
export const GIT_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

type RemoteSource = Exclude<LibrarySource, { type: 'localPath' }>;

export const keyOf = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

/** No shell, no prompts, no hooks, only https/ssh: the remote is untrusted input (§6.3). */
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'true' };
const SAFE_GIT = [
  '-c',
  'protocol.allow=never',
  '-c',
  'protocol.https.allow=always',
  '-c',
  'protocol.ssh.allow=always',
  '-c',
  'core.hooksPath=/dev/null',
];

/** `allowFile` exists for tests against a local repository; the service never sets it. */
export async function git(
  args: string[],
  cwd?: string,
  options: { allowFile?: boolean } = {},
): Promise<string> {
  const config = options.allowFile ? ['-c', 'protocol.file.allow=always'] : [];
  const { stdout } = await run('git', [...SAFE_GIT, ...config, ...args], {
    cwd,
    env: gitEnv,
    timeout: TIMEOUT_MS,
  });
  return stdout;
}

export async function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

async function fetchGit(
  pkg: string,
  source: Extract<RemoteSource, { type: 'git' }>,
  cacheDir: string,
): Promise<string> {
  if (!gitUrlSchema.safeParse(source.url).success)
    throw new RnjbError('RNJB-105', { url: source.url });
  if (!GIT_REF.test(source.ref)) throw new RnjbError('RNJB-101', { package: pkg });

  const target = path.join(cacheDir, 'git', keyOf(`${source.url}#${source.ref}`));
  try {
    if (await exists(path.join(target, '.git'))) {
      // A branch can move: refresh, and keep the cached copy when offline.
      await git(['fetch', '--depth', '1', 'origin', source.ref], target).then(
        () => git(['reset', '--hard', 'FETCH_HEAD'], target),
        () => undefined,
      );
    } else {
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await git(['clone', '--depth', '1', '--branch', source.ref, '--', source.url, target]);
    }
  } catch (cause) {
    await fs.rm(target, { recursive: true, force: true });
    throw new RnjbError('RNJB-101', { package: pkg }, { cause });
  }
  return target;
}

async function fetchRegistry(
  pkg: string,
  source: Extract<RemoteSource, { type: 'registry' }>,
  cacheDir: string,
): Promise<string> {
  const exact = semver.valid(source.version);
  if (!NPM_NAME.test(source.package) || !exact) throw new RnjbError('RNJB-101', { package: pkg });

  const target = path.join(cacheDir, 'registry', keyOf(`${source.package}@${exact}`));
  if (await exists(path.join(target, 'package.json'))) return target;

  const staging = `${target}.tmp`;
  try {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const { stdout } = await run(
      'npm',
      [
        'pack',
        `${source.package}@${exact}`,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        staging,
      ],
      { cwd: staging, timeout: TIMEOUT_MS },
    );
    const files = JSON.parse(stdout) as { filename: string }[];
    const tarball = path.basename(files[0]?.filename ?? '');
    await run('tar', ['-xzf', tarball, '-C', staging, '--strip-components=1'], {
      cwd: staging,
      timeout: TIMEOUT_MS,
    });
    await fs.rm(path.join(staging, tarball), { force: true });
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
  } catch (cause) {
    await fs.rm(staging, { recursive: true, force: true });
    throw new RnjbError('RNJB-101', { package: pkg }, { cause });
  }
  return target;
}

/** Downloads a git or registry source into the cache and returns its directory. */
export function fetchSource(pkg: string, source: RemoteSource, cacheDir: string): Promise<string> {
  return source.type === 'git'
    ? fetchGit(pkg, source, cacheDir)
    : fetchRegistry(pkg, source, cacheDir);
}
