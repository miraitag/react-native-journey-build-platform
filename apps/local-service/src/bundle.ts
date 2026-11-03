import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError } from '@rnjb/core';
import type { LocalSettings } from '@rnjb/pack-schema';
import { build } from 'vite';
import { packIdOf, resolveSourceRoot } from './libraries.ts';

/** Native modules the preview replaces with shims (plan §7.4). Everything else is bundled. */
export const SHIMMED_MODULES = [
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-screens',
  'react-native-safe-area-context',
  'react-native-svg',
  'react-native-share',
  'react-native-view-shot',
  '@react-native-clipboard/clipboard',
  '@react-native-community/netinfo',
] as const;

/** Runtime the preview iframe provides; the bundle never ships its own copy of these. */
const HOST_GLOBALS: Record<string, string> = {
  react: '__rnjb.React',
  'react-dom': '__rnjb.ReactDOM',
  'react/jsx-runtime': '__rnjb.jsx',
  'react/jsx-dev-runtime': '__rnjb.jsx',
  'react-native': '__rnjb.ReactNative',
};

export interface LibraryBundle {
  /** `package@version+hash`: the compiled bundle is valid for exactly this source (§7.1). */
  key: string;
  package: string;
  version: string;
  /** Global the script assigns its exports to. */
  globalName: string;
  /** Self-contained script; host modules are read from `__rnjb`. */
  code: string;
  /** Shimmed modules the library imports. */
  shims: string[];
}

const CACHE_LIMIT = 16;
const cache = new Map<string, LibraryBundle>();

const globalFor = (id: string): string | undefined =>
  HOST_GLOBALS[id] ??
  ((SHIMMED_MODULES as readonly string[]).includes(id)
    ? `__rnjb.shims[${JSON.stringify(id)}]`
    : undefined);

const isHostModule = (id: string) => globalFor(id) !== undefined;

async function findSourceEntry(root: string, json: Record<string, unknown>): Promise<string> {
  const candidates = [json['source'], json['module'], json['main']].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    const absolute = path.resolve(root, candidate);
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new RnjbError('RNJB-403', { path: candidate });
    }
    for (const file of [absolute, `${absolute}.tsx`, `${absolute}.ts`, `${absolute}.js`]) {
      const isFile = await fs.stat(file).then(
        (stat) => stat.isFile(),
        () => false,
      );
      if (isFile && !file.endsWith('.d.ts')) return file;
    }
  }
  throw new RnjbError('RNJB-104', { package: String(json['name']) });
}

/** Hash of the entry's directory tree (without `node_modules`), so edits invalidate the cache. */
async function hashSources(directory: string, hash = createHash('sha1')): Promise<string> {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashSources(full, hash);
    else if (entry.isFile()) hash.update(entry.name).update(await fs.readFile(full));
  }
  return hash.digest('hex');
}

/**
 * Compiles the library for the web preview (§7.1 step 3): Vite in library mode, IIFE output,
 * React and react-native-web provided by the iframe, native modules replaced by shims.
 */
export async function compileLibrary(
  pkg: string,
  context: { settings: LocalSettings; browseRoot: string; cacheDir: string },
): Promise<LibraryBundle> {
  const root = await fs.realpath(await resolveSourceRoot(pkg, context));
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch (cause) {
    throw new RnjbError('RNJB-101', { path: root }, { cause });
  }
  if (json['name'] !== pkg) {
    throw new RnjbError('RNJB-102', { expected: pkg, found: String(json['name']) });
  }
  const version = typeof json['version'] === 'string' ? json['version'] : '0.0.0';
  const entry = await findSourceEntry(root, json);
  const sourceDirectory = path.dirname(entry);
  const digest = (await hashSources(sourceDirectory)).slice(0, 12);
  const key = `${pkg}@${version}+${digest}`;

  const cached = cache.get(key);
  if (cached) return cached;

  const globalName = `RnjbLib_${packIdOf(pkg).replace(/-/g, '_')}`;
  const shims = new Set<string>();
  let code: string;
  try {
    const result = await build({
      configFile: false,
      root,
      logLevel: 'silent',
      mode: 'production',
      define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
      resolve: {
        extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
      },
      // The iframe provides react/jsx-runtime, which has no `jsxDEV`.
      oxc: { jsx: { runtime: 'automatic', development: false } },
      build: {
        write: false,
        minify: true,
        sourcemap: false,
        target: 'es2023',
        lib: { entry, name: globalName, formats: ['iife'], fileName: 'bundle' },
        rolldownOptions: {
          external: (id: string) => {
            if (!isHostModule(id)) return false;
            if (!(id in HOST_GLOBALS)) shims.add(id);
            return true;
          },
          output: { globals: (id: string) => globalFor(id) ?? id },
        },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) =>
      'output' in item ? item.output : [],
    );
    const chunk = outputs.find((item) => item.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('no chunk emitted');
    code = chunk.code;
  } catch (cause) {
    throw new RnjbError('RNJB-106', { package: pkg }, { cause });
  }

  const bundle: LibraryBundle = {
    key,
    package: pkg,
    version,
    globalName,
    code,
    shims: [...shims].sort(),
  };
  cache.set(key, bundle);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return bundle;
}
