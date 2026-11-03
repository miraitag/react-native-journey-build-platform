import {
  isErrorCode,
  type ErrorCode,
  type ErrorParams,
  type RnjbDocument,
  type SerializedRnjbError,
  type WorkspaceEntry,
} from '@rnjb/core';
import type { CheckResult, ExportPlanResult, ExportScope, ImportReport } from '@rnjb/codegen';
import type {
  DevicesPack,
  HooksPack,
  LibraryPack,
  LocalSettings,
  PackageJsonImport,
} from '@rnjb/pack-schema';

const BASE_URL: string = import.meta.env.VITE_RNJB_SERVICE_URL ?? 'http://127.0.0.1:4317';

export class ServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
  ) {
    super(code);
    this.name = 'ServiceError';
  }

  toJSON(): SerializedRnjbError {
    return { code: this.code, severity: 'error', params: this.params };
  }
}

export interface WorkspaceIndex {
  entries: WorkspaceEntry[];
  invalid: { path: string; code: string }[];
}

export interface LibraryDiff {
  addedComponents: string[];
  removedComponents: string[];
  changedComponents: {
    name: string;
    addedProps: string[];
    removedProps: string[];
    changedProps: string[];
  }[];
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  directories: string[];
}

/** One remote source after a synchronization (§6.4). */
export interface RemoteSyncResult {
  id: string;
  name: string;
  ref: string;
  commit?: string;
  /** The remote could not be reached and the last copy is shown. */
  stale?: boolean;
  entries: WorkspaceEntry[];
  error?: SerializedRnjbError;
}

/**
 * HTTP adapter for the local service (ADR 0004/0009). The session token lives in memory only.
 */
class LocalServiceClient {
  private token: string | undefined;

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    if (auth && !this.token) await this.handshake();
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        // A Blob is a JSON body built elsewhere (a large file encoded in the worker).
        body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
      });
    } catch {
      throw new ServiceError('RNJB-401');
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: SerializedRnjbError };
    if (!response.ok) {
      const code = payload.error?.code;
      if (code === 'RNJB-402') this.token = undefined;
      throw new ServiceError(isErrorCode(code) ? code : 'RNJB-401', payload.error?.params ?? {});
    }
    return payload as T;
  }

  async handshake(): Promise<void> {
    const { token } = await this.request<{ token: string }>(
      'POST',
      '/v1/session',
      undefined,
      false,
    );
    this.token = token;
  }

  health = () =>
    this.request<{ ok: boolean; version: string }>('GET', '/v1/health', undefined, false);
  settings = () => this.request<LocalSettings>('GET', '/v1/settings');
  saveSettings = (settings: LocalSettings) =>
    this.request<LocalSettings>('PUT', '/v1/settings', settings);
  index = () => this.request<WorkspaceIndex>('GET', '/v1/workspace/index');
  changes = (after: number) =>
    this.request<{ seq: number; paths: string[] }>('GET', `/v1/workspace/changes?after=${after}`);
  readFile = (path: string) =>
    this.request<{ path: string; contents: string }>(
      'GET',
      `/v1/workspace/file?path=${encodeURIComponent(path)}`,
    );
  /** `contents` is a string, or UTF-8 bytes of it already encoded as a JSON string. */
  writeFile = (
    path: string,
    contents: string | Uint8Array<ArrayBuffer>,
    options: { createOnly?: boolean; expectedIntegrity?: string } = {},
  ) =>
    this.request<{ ok: true }>(
      'PUT',
      '/v1/workspace/file',
      typeof contents === 'string'
        ? { path, contents, ...options }
        : new Blob(
            [JSON.stringify({ path, ...options }).slice(0, -1), ',"contents":', contents, '}'],
            {
              type: 'application/json',
            },
          ),
    );
  deleteFile = (path: string) =>
    this.request<{ path: string; contents: string }>(
      'DELETE',
      `/v1/workspace/file?path=${encodeURIComponent(path)}`,
    );
  browse = (path?: string) =>
    this.request<BrowseResult>(
      'GET',
      `/v1/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`,
    );
  listLibraryPacks = () =>
    this.request<{ packs: LibraryPack[]; invalid: { path: string; code: string }[] }>(
      'GET',
      '/v1/libraries/packs',
    );
  listDevicesPacks = () =>
    this.request<{ packs: DevicesPack[]; invalid: { path: string }[] }>('GET', '/v1/devices/packs');
  listHooksPacks = () =>
    this.request<{ packs: HooksPack[]; invalid: { path: string }[] }>('GET', '/v1/hooks/packs');
  libraryBundle = (pkg: string) =>
    this.request<{ key: string; globalName: string; code: string; shims: string[] }>(
      'GET',
      `/v1/libraries/bundle?package=${encodeURIComponent(pkg)}`,
    );
  extractLibrary = (pkg: string) =>
    this.request<{ pack: LibraryPack; diff: LibraryDiff }>('POST', '/v1/libraries/extract', {
      package: pkg,
    });
  importPackageJson = (libraryPath: string, examplePath?: string) =>
    this.request<PackageJsonImport>('POST', '/v1/team/import-package-json', {
      libraryPath,
      examplePath,
    });
  syncRemotes = (id?: string) =>
    this.request<RemoteSyncResult[]>('POST', '/v1/remotes/sync', id ? { id } : {});
  readRemoteFile = (id: string, path: string) =>
    this.request<{ path: string; contents: string }>(
      'GET',
      `/v1/remotes/file?id=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`,
    );
  planExport = (document: RnjbDocument, target: string, scope: ExportScope) =>
    this.request<ExportPlanResult>('POST', '/v1/export/plan', { document, target, scope });
  applyExport = (
    document: RnjbDocument,
    target: string,
    scope: ExportScope,
    files: Record<string, string>,
    onDisk: Record<string, string>,
  ) =>
    this.request<{ written: string[] }>('POST', '/v1/export/apply', {
      document,
      target,
      scope,
      files,
      onDisk,
    });
  checkExport = (document: RnjbDocument, target: string) =>
    this.request<CheckResult[]>('POST', '/v1/export/check', { document, target });
  importRepository = (folder: string, name: string, slug: string) =>
    this.request<{
      path: string;
      report: ImportReport;
      skipped: string[];
      profile: { id: string; score: number; threshold: number; detected: boolean };
    }>('POST', '/v1/import/run', {
      folder,
      name,
      slug,
    });
}

export const localService = new LocalServiceClient();
