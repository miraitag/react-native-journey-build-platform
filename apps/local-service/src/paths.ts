import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError } from '@rnjb/core';

const isInside = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

/**
 * Resolves `relativePath` under `root` and refuses anything that escapes it, including through
 * symlinks of existing ancestors (ADR 0004). Applies to paths from the UI, a `.rnjb` or a remote.
 */
export async function resolveInside(root: string, relativePath: string): Promise<string> {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.includes('\0') ||
    path.isAbsolute(relativePath) ||
    /^[A-Za-z]:/.test(relativePath)
  ) {
    throw new RnjbError('RNJB-403', { path: String(relativePath) });
  }
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, relativePath);
  if (!isInside(realRoot, target)) throw new RnjbError('RNJB-403', { path: relativePath });

  let probe = target;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (real !== realRoot && !isInside(realRoot, real)) {
        throw new RnjbError('RNJB-403', { path: relativePath });
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return target;
}

/** Absolute paths chosen by the user must still live under an allowed base (e.g. the home dir). */
export async function assertAbsoluteInside(base: string, absolutePath: string): Promise<string> {
  if (!path.isAbsolute(absolutePath) || absolutePath.includes('\0')) {
    throw new RnjbError('RNJB-403', { path: absolutePath });
  }
  const realBase = await fs.realpath(base);
  const real = await fs.realpath(absolutePath).catch(() => {
    throw new RnjbError('RNJB-404', { path: absolutePath });
  });
  if (real !== realBase && !isInside(realBase, real)) {
    throw new RnjbError('RNJB-403', { path: absolutePath });
  }
  return real;
}

/** Writes through a temp file + rename so a crash never leaves a half-written `.rnjb`. */
export async function writeFileAtomic(
  target: string,
  contents: string,
  mode = 0o644,
): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, contents, { encoding: 'utf8', mode });
  await fs.rename(temp, target);
}

export const toPosix = (value: string): string => value.split(path.sep).join('/');
