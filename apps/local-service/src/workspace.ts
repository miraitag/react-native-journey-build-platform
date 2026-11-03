import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { RnjbError, buildOutline, type WorkspaceEntry } from '@rnjb/core';
import { metaSchema, profileRefSchema } from '@rnjb/document-schema';
import { TEAM_SCHEMA_VERSION } from '@rnjb/pack-schema';
import { z } from 'zod';
import { resolveInside, toPosix, writeFileAtomic } from './paths.ts';

const ENTRY_DIRS = ['journeys', 'templates'] as const;
const STRUCTURE = [
  'journeys',
  'templates',
  'packs/libraries',
  'packs/hooks',
  'packs/devices',
  'packs/blocks',
  'packs/profiles',
  '.rnjb-cache',
];
const WRITABLE = /^(journeys|templates|packs)\/.+\.(rnjb|json)$|^rnjb\.team\.json$/;
/** Only journey and template entries can be deleted (they go to the trash, §18.4). */
const DELETABLE = /^(journeys|templates)\/([a-z][a-z0-9-]*)\/\2\.rnjb$/;
const ENTRY_PATH = /^(journeys|templates)\/[^/]+\/[^/]+\.rnjb$/;
/** Changes kept for clients that poll; older ones are dropped. */
const CHANGE_LIMIT = 200;

const remoteSchema = z.object({
  remote: z.string(),
  ref: z.string(),
  path: z.string(),
  commit: z.string(),
  base: z.string().optional(),
});

const headerSchema = z.looseObject({
  format: z.literal('rnjb'),
  meta: metaSchema,
  profile: profileRefSchema,
  libraries: z.array(z.looseObject({ package: z.string() })),
  screens: z.array(z.looseObject({ id: z.string() })),
  connections: z
    .array(z.looseObject({ fromScreenId: z.string(), toScreenId: z.string() }))
    .default([]),
  board: z
    .looseObject({
      initialScreenId: z.string().optional(),
      positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    })
    .default({ positions: {} }),
  provenance: z
    .looseObject({ importedFrom: z.unknown().optional(), remote: z.unknown().optional() })
    .optional(),
});

export interface IndexResult {
  entries: WorkspaceEntry[];
  invalid: { path: string; code: string }[];
}

export interface WorkspaceChanges {
  /** Pass it back as `after` to get only what changed since. */
  seq: number;
  paths: string[];
}

export class Workspace {
  private readonly cache = new Map<string, { key: string; entry: WorkspaceEntry | null }>();
  private watcher: FSWatcher | undefined;
  private seq = 0;
  private changes: { seq: number; path: string }[] = [];

  constructor(readonly root: string) {}

  /** Records every change to a journey or template file, e.g. after a `git pull` (§6.5). */
  watch(): void {
    if (this.watcher) return;
    this.watcher = watch(this.root, { recursive: true }, (_event, filename) => {
      const relative = filename ? toPosix(filename.toString()) : '';
      if (!ENTRY_PATH.test(relative)) return;
      this.changes.push({ seq: ++this.seq, path: relative });
      if (this.changes.length > CHANGE_LIMIT) this.changes.shift();
    });
    this.watcher.on('error', () => this.close());
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  changesAfter(after: number): WorkspaceChanges {
    // A client ahead of us saw an earlier service (restart or another workspace): send everything.
    if (after > this.seq) after = 0;
    const paths = new Set(this.changes.filter((change) => change.seq > after).map((c) => c.path));
    return { seq: this.seq, paths: [...paths].sort() };
  }

  async ensureStructure(): Promise<void> {
    for (const dir of STRUCTURE) await fs.mkdir(path.join(this.root, dir), { recursive: true });
    const team = path.join(this.root, 'rnjb.team.json');
    const exists = await fs.stat(team).catch(() => undefined);
    if (!exists) {
      const initial = { schemaVersion: TEAM_SCHEMA_VERSION, activePacks: [], libraries: [] };
      await writeFileAtomic(team, `${JSON.stringify(initial, null, 2)}\n`);
    }
  }

  /** Incremental index keyed by mtime + size (§19.1). */
  async index(): Promise<IndexResult> {
    const entries: WorkspaceEntry[] = [];
    const invalid: IndexResult['invalid'] = [];
    const seen = new Set<string>();

    for (const dir of ENTRY_DIRS) {
      const base = path.join(this.root, dir);
      const slugs = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
      for (const slugDir of slugs) {
        if (!slugDir.isDirectory()) continue;
        const relative = `${dir}/${slugDir.name}/${slugDir.name}.rnjb`;
        const absolute = path.join(this.root, relative);
        const stat = await fs.stat(absolute).catch(() => undefined);
        if (!stat?.isFile()) continue;
        seen.add(relative);
        const key = `${stat.mtimeMs}:${stat.size}`;
        const cached = this.cache.get(relative);
        let entry = cached?.key === key ? cached.entry : undefined;
        if (entry === undefined) {
          entry = await this.readEntry(relative, absolute);
          this.cache.set(relative, { key, entry });
        }
        if (entry) entries.push(entry);
        else invalid.push({ path: relative, code: 'RNJB-201' });
      }
    }
    for (const key of this.cache.keys()) if (!seen.has(key)) this.cache.delete(key);
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { entries, invalid };
  }

  private async readEntry(relative: string, absolute: string): Promise<WorkspaceEntry | null> {
    try {
      const header = headerSchema.safeParse(JSON.parse(await fs.readFile(absolute, 'utf8')));
      if (!header.success) return null;
      const { meta, profile, libraries, screens, provenance } = header.data;
      const remote = remoteSchema.safeParse(provenance?.remote);
      return {
        path: toPosix(relative),
        kind: meta.kind,
        slug: meta.slug,
        name: meta.name,
        updatedAt: meta.updatedAt,
        profile,
        libraries: libraries.map((library) => library.package),
        origin: provenance?.remote ? 'remote' : provenance?.importedFrom ? 'imported' : 'local',
        ...(remote.success ? { remote: remote.data } : {}),
        screenCount: screens.length,
        outline: buildOutline(header.data),
      };
    } catch {
      return null;
    }
  }

  async read(relative: string): Promise<string> {
    const absolute = await resolveInside(this.root, relative);
    try {
      return await fs.readFile(absolute, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new RnjbError('RNJB-404', { path: relative });
      throw error;
    }
  }

  /** With `expectedIntegrity`, refuses to overwrite a `.rnjb` that changed on disk since it was read. */
  async write(
    relative: string,
    contents: string,
    createOnly = false,
    expectedIntegrity?: string,
  ): Promise<void> {
    if (!WRITABLE.test(relative)) throw new RnjbError('RNJB-403', { path: relative });
    const absolute = await resolveInside(this.root, relative);
    if (createOnly && (await fs.stat(absolute).catch(() => undefined))) {
      throw new RnjbError('RNJB-002', { slug: path.basename(relative, '.rnjb') });
    }
    if (expectedIntegrity !== undefined) {
      const text = await fs.readFile(absolute, 'utf8').catch(() => undefined);
      let onDisk: unknown = expectedIntegrity;
      try {
        if (text !== undefined) onDisk = (JSON.parse(text) as { integrity?: unknown }).integrity;
      } catch {
        onDisk = undefined;
      }
      if (onDisk !== expectedIntegrity) throw new RnjbError('RNJB-208', { path: relative });
    }
    await writeFileAtomic(absolute, contents);
  }

  /** Removes an entry file and its folder when nothing else is left in it. Returns the contents. */
  async remove(relative: string): Promise<string> {
    if (!DELETABLE.test(relative)) throw new RnjbError('RNJB-403', { path: relative });
    const contents = await this.read(relative);
    const absolute = await resolveInside(this.root, relative);
    await fs.rm(absolute);
    await fs.rmdir(path.dirname(absolute)).catch(() => undefined);
    this.cache.delete(relative);
    return contents;
  }
}
