import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  PLATFORM_VERSION,
  RnjbError,
  isRnjbError,
  normalizeSlug,
  type ErrorCode,
} from '@rnjb/core';
import {
  importPackageJson,
  parseTeamConfig,
  type LocalSettings,
  type RemoteSource,
} from '@rnjb/pack-schema';
import type { EmitOptions } from '@rnjb/codegen';
import { documentSchema } from '@rnjb/document-schema';
import { z } from 'zod';
import { assertAbsoluteInside } from './paths.ts';
import { extractLibrary, listLibraryPacks } from './libraries.ts';
import { listDevicesPacks } from './devices.ts';
import { listHooksPacks } from './hooks-packs.ts';
import { readRemoteFile, syncRemote } from './remote-sync.ts';
import { compileLibrary } from './bundle.ts';
import { applyDocumentExport, planDocumentExport, runChecks } from './export.ts';
import { importRepository } from './import.ts';
import { securityHook } from './security.ts';
import type { SettingsStore } from './settings-store.ts';
import { Workspace } from './workspace.ts';

export interface ServerOptions {
  port: number;
  allowedOrigins: readonly string[];
  token: string;
  settings: SettingsStore;
  /** Base for folder browsing and explicitly chosen files; defaults to the user's home. */
  browseRoot?: string;
  logger?: boolean;
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  'RNJB-002': 409,
  'RNJB-402': 403,
  'RNJB-403': 403,
  'RNJB-404': 404,
  'RNJB-501': 409,
  'RNJB-208': 409,
};

const relativePathQuery = z.object({ path: z.string().min(1).max(1024) });
const writeBody = z.object({
  path: z.string().min(1).max(1024),
  contents: z.string(),
  createOnly: z.boolean().optional(),
  expectedIntegrity: z.string().max(200).optional(),
});
const importBody = z.object({
  libraryPath: z.string().min(1),
  examplePath: z.string().min(1).optional(),
});
const extractBody = z.object({ package: z.string().min(1).max(214) });
const syncBody = z.object({ id: z.string().min(1).max(200).optional() });
const remoteFileQuery = z.object({
  id: z.string().min(1).max(200),
  path: z.string().min(1).max(1024),
});
const exportBase = {
  document: documentSchema,
  target: z.string().min(1).max(1024),
  scope: z.enum(['project', 'src']).default('project'),
};
const exportPlanBody = z.object(exportBase);
const exportApplyBody = z.object({
  ...exportBase,
  files: z.record(z.string().max(1024), z.string()),
  onDisk: z.record(z.string().max(1024), z.string()),
});
const exportCheckBody = z.object({
  document: documentSchema,
  target: z.string().min(1).max(1024),
});
const importBodyRepo = z.object({
  folder: z.string().min(1).max(1024),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(100),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new RnjbError('RNJB-405', { path: String(result.error.issues[0]?.path ?? '') });
  return result.data;
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 * 1024 });
  const browseRoot = options.browseRoot ?? os.homedir();
  /** The cache folder chosen in settings (§6.2), else one inside the service home. */
  const cacheDirOf = (settings: LocalSettings): string =>
    settings.cacheDir ?? path.join(options.settings.home, 'cache');
  let workspace: Workspace | undefined;

  const currentWorkspace = async (): Promise<Workspace> => {
    const settings = await options.settings.load();
    if (!settings.workspacePath) throw new RnjbError('RNJB-501');
    if (workspace?.root !== settings.workspacePath) {
      workspace?.close();
      workspace = new Workspace(settings.workspacePath);
      workspace.watch();
    }
    return workspace;
  };

  app.addHook('onRequest', securityHook(options));

  app.setErrorHandler((error, request, reply) => {
    if (isRnjbError(error)) {
      const status = STATUS[error.code] ?? 400;
      return reply.code(status).send({ error: error.toJSON() });
    }
    request.log.error(error);
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply
        .code(status)
        .send({ error: { code: 'RNJB-405', severity: 'error', params: {} } });
    return reply.code(500).send({ error: { code: 'RNJB-401', severity: 'error', params: {} } });
  });

  app.get('/v1/health', async () => ({ ok: true, version: PLATFORM_VERSION }));

  app.post('/v1/session', async () => ({ token: options.token }));

  app.get('/v1/settings', async () => options.settings.load());

  app.put('/v1/settings', async (request) => {
    const saved = await options.settings.save(request.body as LocalSettings);
    if (saved.workspacePath) await new Workspace(saved.workspacePath).ensureStructure();
    return saved;
  });

  app.get('/v1/workspace/index', async () => (await currentWorkspace()).index());

  /** Journey and template files changed on disk since `after` (§6.5). */
  app.get('/v1/workspace/changes', async (request) => {
    const { after } = parse(z.object({ after: z.coerce.number().int().min(0) }), request.query);
    return (await currentWorkspace()).changesAfter(after);
  });

  app.addHook('onClose', async () => workspace?.close());

  app.get('/v1/workspace/file', async (request) => {
    const { path: relative } = parse(relativePathQuery, request.query);
    return { path: relative, contents: await (await currentWorkspace()).read(relative) };
  });

  app.put('/v1/workspace/file', async (request) => {
    const body = parse(writeBody, request.body);
    await (
      await currentWorkspace()
    ).write(body.path, body.contents, body.createOnly, body.expectedIntegrity);
    return { ok: true };
  });

  app.delete('/v1/workspace/file', async (request) => {
    const { path: relative } = parse(relativePathQuery, request.query);
    return { path: relative, contents: await (await currentWorkspace()).remove(relative) };
  });

  /** Library packs of the workspace: the catalog's source (§7). */
  app.get('/v1/libraries/packs', async () => listLibraryPacks(await currentWorkspace()));
  app.get('/v1/devices/packs', async () => listDevicesPacks(await currentWorkspace()));
  app.get('/v1/hooks/packs', async () => listHooksPacks(await currentWorkspace()));

  /** Extracts and stores the manifest of a library with a configured source (§7.1). */
  app.post('/v1/libraries/extract', async (request) => {
    const body = parse(extractBody, request.body);
    const settings = await options.settings.load();
    return extractLibrary(body.package, {
      settings,
      workspace: await currentWorkspace(),
      browseRoot,
      cacheDir: cacheDirOf(settings),
    });
  });

  /** Compiled web bundle of a library for the preview iframe (§7.1 step 3). */
  app.get('/v1/libraries/bundle', async (request) => {
    const { package: pkg } = parse(extractBody, request.query);
    const settings = await options.settings.load();
    return compileLibrary(pkg, { settings, browseRoot, cacheDir: cacheDirOf(settings) });
  });

  const remoteSource = async (id: string): Promise<RemoteSource> => {
    const found = (await options.settings.load()).remoteSources.find((source) => source.id === id);
    if (!found) throw new RnjbError('RNJB-404', { path: id });
    return found;
  };

  /** Synchronizes one remote source, or all of them (§6.4). One failing source does not stop the rest. */
  app.post('/v1/remotes/sync', async (request) => {
    const { id } = parse(syncBody, request.body ?? {});
    const settings = await options.settings.load();
    const cacheDir = cacheDirOf(settings);
    const sources = id ? [await remoteSource(id)] : settings.remoteSources;
    return Promise.all(
      sources.map(async (source) => {
        const base = { id: source.id, name: source.name, ref: source.ref };
        try {
          const synced = await syncRemote(source, cacheDir);
          return { ...base, ...synced };
        } catch (error) {
          if (!isRnjbError(error)) throw error;
          return { ...base, entries: [], error: error.toJSON() };
        }
      }),
    );
  });

  app.get('/v1/remotes/file', async (request) => {
    const query = parse(remoteFileQuery, request.query);
    const source = await remoteSource(query.id);
    const cacheDir = cacheDirOf(await options.settings.load());
    return { path: query.path, contents: await readRemoteFile(source, cacheDir, query.path) };
  });

  /** Directory names only, under the browse root, for the "Examinar" dialog (§6.2). */
  app.get('/v1/fs/browse', async (request) => {
    const { path: requested } = parse(z.object({ path: z.string().optional() }), request.query);
    const directory = await assertAbsoluteInside(browseRoot, requested ?? browseRoot);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return {
      path: directory,
      parent: directory === (await fs.realpath(browseRoot)) ? null : path.dirname(directory),
      directories: entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b)),
    };
  });

  /** Reads two explicitly chosen `package.json` files and proposes the team setup (§7.6). */
  app.post('/v1/team/import-package-json', async (request) => {
    const body = parse(importBody, request.body);
    const readPackageJson = async (file: string): Promise<unknown> => {
      if (path.basename(file) !== 'package.json') throw new RnjbError('RNJB-403', { path: file });
      const real = await assertAbsoluteInside(browseRoot, file);
      try {
        return JSON.parse(await fs.readFile(real, 'utf8'));
      } catch (cause) {
        throw new RnjbError('RNJB-502', { file }, { cause });
      }
    };
    const library = await readPackageJson(body.libraryPath);
    const example = body.examplePath ? await readPackageJson(body.examplePath) : undefined;
    const result = importPackageJson(library, example);
    if (!result.ok) throw result.error;
    return result.value;
  });

  /** The team's dependency template from `rnjb.team.json`, when there is a workspace (§7.6). */
  const emitOptions = async (): Promise<EmitOptions> => {
    const text = await currentWorkspace()
      .then((ws) => ws.read('rnjb.team.json'))
      .catch(() => undefined);
    if (text === undefined) return {};
    // An invalid team file is reported: exporting without the team's dependencies would be silent.
    const team = parseTeamConfig(text);
    if (!team.ok) throw team.error;
    return team.value.dependencyTemplate
      ? { dependencyTemplate: team.value.dependencyTemplate }
      : {};
  };

  /** Export folder: an existing one, or a new one inside the browse root (§16.2). */
  const exportTarget = async (target: string, create: boolean): Promise<string | undefined> => {
    if (!path.isAbsolute(target)) throw new RnjbError('RNJB-403', { path: target });
    const isDirectory = await fs.stat(target).then(
      (stat) => stat.isDirectory(),
      () => false,
    );
    if (isDirectory) return assertAbsoluteInside(browseRoot, target);
    const parent = await assertAbsoluteInside(browseRoot, path.dirname(target));
    if (!create) return undefined;
    const directory = path.join(parent, path.basename(target));
    await fs.mkdir(directory);
    return fs.realpath(directory);
  };

  /** What an export would do, file by file, without writing anything (§16.3). */
  app.post('/v1/export/plan', async (request) => {
    const body = parse(exportPlanBody, request.body);
    const target = await exportTarget(body.target, false);
    return planDocumentExport(body.document, target, body.scope, await emitOptions());
  });

  /** Writes only the files the user confirmed, and the lock. */
  app.post('/v1/export/apply', async (request) => {
    const body = parse(exportApplyBody, request.body);
    const target = (await exportTarget(body.target, true)) as string;
    return applyDocumentExport(
      body.document,
      target,
      body.scope,
      body.files,
      body.onDisk,
      await emitOptions(),
    );
  });

  /** Runs the profile checks, only on demand (§16.4). */
  app.post('/v1/export/check', async (request) => {
    const body = parse(exportCheckBody, request.body);
    const target = await exportTarget(body.target, false);
    if (!target) throw new RnjbError('RNJB-404', { path: body.target });
    return runChecks(body.document, target, (await options.settings.load()).skillsPath);
  });

  /** Reverse-engineers a feature library into a new journey; the folder is only read (§17). */
  app.post('/v1/import/run', async (request) => {
    const body = parse(importBodyRepo, request.body);
    const slug = normalizeSlug(body.slug);
    if (!slug.ok) throw slug.error;
    const folder = await assertAbsoluteInside(browseRoot, body.folder);
    return importRepository(
      folder,
      { name: body.name, slug: slug.value.slug },
      await currentWorkspace(),
    );
  });

  return app;
}
