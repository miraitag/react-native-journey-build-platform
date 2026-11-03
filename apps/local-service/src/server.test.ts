import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyBasicJourney, createDocument } from '@rnjb/core';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const PORT = 4999;
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-token-0123456789';
const host = `127.0.0.1:${PORT}`;

let tmp: string;
let workspace: string;
let app: ReturnType<typeof buildServer>;

const authed = { host, origin: ORIGIN, authorization: `Bearer ${TOKEN}` };

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-')));
  workspace = path.join(tmp, 'workspace');
  await fs.mkdir(workspace);
  app = buildServer({
    port: PORT,
    allowedOrigins: [ORIGIN],
    token: TOKEN,
    settings: new SettingsStore(path.join(tmp, 'home')),
    browseRoot: tmp,
  });
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

async function configureWorkspace() {
  const response = await app.inject({
    method: 'PUT',
    url: '/v1/settings',
    headers: authed,
    payload: { schemaVersion: 1, workspacePath: workspace },
  });
  expect(response.statusCode).toBe(200);
}

describe('security (ADR 0004)', () => {
  it('serves health without token but checks the host', async () => {
    expect((await app.inject({ url: '/v1/health', headers: { host } })).statusCode).toBe(200);
    const rebinding = await app.inject({
      url: '/v1/health',
      headers: { host: 'evil.example:4999' },
    });
    expect(rebinding.statusCode).toBe(403);
  });

  it('rejects foreign origins, even for the session handshake', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/session',
      headers: { host, origin: 'https://evil.example' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('RNJB-402');
  });

  it('hands the token only to the allowed origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/session',
      headers: { host, origin: ORIGIN },
    });
    expect(response.json()).toEqual({ token: TOKEN });
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('rejects requests without token or without origin', async () => {
    expect(
      (await app.inject({ url: '/v1/settings', headers: { host, origin: ORIGIN } })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/v1/settings',
          headers: { host, authorization: `Bearer ${TOKEN}` },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: '/v1/settings', headers: authed })).statusCode).toBe(200);
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/v1/settings',
      headers: { host, origin: ORIGIN },
    });
    expect(ok.statusCode).toBe(204);
    const bad = await app.inject({
      method: 'OPTIONS',
      url: '/v1/settings',
      headers: { host, origin: 'null' },
    });
    expect(bad.statusCode).toBe(403);
  });

  it('stores settings with private permissions', async () => {
    await configureWorkspace();
    const stat = await fs.stat(path.join(tmp, 'home', 'settings.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('refuses git sources with disallowed schemes', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: authed,
      payload: {
        schemaVersion: 1,
        librarySources: { x: { type: 'git', url: 'file:///etc', ref: 'main' } },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('RNJB-405');
  });
});

describe('workspace', () => {
  it('creates the structure and the team file', async () => {
    await configureWorkspace();
    const team = JSON.parse(await fs.readFile(path.join(workspace, 'rnjb.team.json'), 'utf8'));
    expect(team).toEqual({ schemaVersion: 1, activePacks: [], libraries: [] });
    await expect(fs.stat(path.join(workspace, 'packs/devices'))).resolves.toBeTruthy();
  });

  it.each([
    '../outside.rnjb',
    'journeys/../../outside.rnjb',
    '/etc/passwd',
    'journeys/a/a.exe',
    'rnjb.team.json\0',
  ])('rejects writing %s', async (target) => {
    await configureWorkspace();
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/workspace/file',
      headers: authed,
      payload: { path: target, contents: '{}' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects writes through a symlink that leaves the workspace', async () => {
    await configureWorkspace();
    await fs.mkdir(path.join(tmp, 'elsewhere'));
    await fs.symlink(path.join(tmp, 'elsewhere'), path.join(workspace, 'journeys', 'link'));
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/workspace/file',
      headers: authed,
      payload: { path: 'journeys/link/link.rnjb', contents: '{}' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('indexes journeys and skips invalid files', async () => {
    await configureWorkspace();
    const doc = {
      format: 'rnjb',
      formatVersion: 1,
      meta: {
        kind: 'journey',
        name: 'Pagos',
        slug: 'payments',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        platformVersion: '0.1.0',
      },
      profile: { id: 'feature-library', version: '1.0.0' },
      libraries: [{ package: 'react-native', version: '1', packId: 'rn' }],
      screens: [],
    };
    for (const [slug, contents] of [
      ['payments', JSON.stringify(doc)],
      ['broken', '{ nope'],
    ] as const) {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/workspace/file',
        headers: authed,
        payload: { path: `journeys/${slug}/${slug}.rnjb`, contents },
      });
      expect(response.statusCode).toBe(200);
    }
    const index = (await app.inject({ url: '/v1/workspace/index', headers: authed })).json();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({
      slug: 'payments',
      origin: 'local',
      libraries: ['react-native'],
    });
    expect(index.invalid).toEqual([{ path: 'journeys/broken/broken.rnjb', code: 'RNJB-201' }]);
  });

  it('writes create-only entries once and deletes entries returning their contents', async () => {
    await configureWorkspace();
    const put = (createOnly: boolean) =>
      app.inject({
        method: 'PUT',
        url: '/v1/workspace/file',
        headers: authed,
        payload: { path: 'journeys/pay/pay.rnjb', contents: '{"a":1}', createOnly },
      });
    expect((await put(true)).statusCode).toBe(200);
    const again = await put(true);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('RNJB-002');

    const save = (expectedIntegrity: string) =>
      app.inject({
        method: 'PUT',
        url: '/v1/workspace/file',
        headers: authed,
        payload: { path: 'journeys/pay/pay.rnjb', contents: '{"a":1}', expectedIntegrity },
      });
    await fs.writeFile(path.join(workspace, 'journeys/pay/pay.rnjb'), '{"integrity":"disk"}');
    expect((await save('read-before')).json().error.code).toBe('RNJB-208');
    expect((await save('disk')).statusCode).toBe(200);

    const removed = await app.inject({
      method: 'DELETE',
      url: '/v1/workspace/file?path=journeys/pay/pay.rnjb',
      headers: authed,
    });
    expect(removed.json()).toEqual({ path: 'journeys/pay/pay.rnjb', contents: '{"a":1}' });
    await expect(fs.stat(path.join(workspace, 'journeys/pay'))).rejects.toThrow();
    expect((await put(true)).statusCode).toBe(200);
  });

  it.each(['rnjb.team.json', 'journeys/a/b.rnjb', 'journeys/../rnjb.team.json', 'packs/x.json'])(
    'refuses to delete %s',
    async (target) => {
      await configureWorkspace();
      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/workspace/file?path=${encodeURIComponent(target)}`,
        headers: authed,
      });
      expect(response.statusCode).toBe(403);
    },
  );

  it('imports package.json files chosen by the user', async () => {
    const lib = path.join(tmp, 'feature', 'package.json');
    await fs.mkdir(path.dirname(lib));
    await fs.writeFile(lib, JSON.stringify({ name: 'f', peerDependencies: { react: '*' } }));
    const response = await app.inject({
      method: 'POST',
      url: '/v1/team/import-package-json',
      headers: authed,
      payload: { libraryPath: lib },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().libraries).toEqual([{ package: 'react', range: '*' }]);
  });

  it('refuses to read files that are not package.json', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/team/import-package-json',
      headers: authed,
      payload: { libraryPath: '/etc/passwd' },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('remote sources', () => {
  it('has nothing to synchronize until a source is configured', async () => {
    await configureWorkspace();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/remotes/sync',
      headers: { ...authed, 'content-type': 'application/json' },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('answers 404 for a source that is not configured', async () => {
    await configureWorkspace();
    const sync = await app.inject({
      method: 'POST',
      url: '/v1/remotes/sync',
      headers: authed,
      payload: { id: 'nope' },
    });
    expect(sync.statusCode).toBe(404);
    const file = await app.inject({
      url: '/v1/remotes/file?id=nope&path=journeys/a/a.rnjb',
      headers: authed,
    });
    expect(file.statusCode).toBe(404);
  });

  it('refuses remote sources with disallowed schemes', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: authed,
      payload: {
        schemaVersion: 1,
        remoteSources: [
          { id: 'a', name: 'A', remote: 'file:///etc', ref: 'main', path: '', provider: 'git' },
        ],
      },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('external changes (§6.5)', () => {
  it('reports journey files changed on disk since the last poll', async () => {
    await configureWorkspace();
    const changes = async (after: number) =>
      (await app.inject({ url: `/v1/workspace/changes?after=${after}`, headers: authed })).json();
    const first = await changes(0);

    await fs.mkdir(path.join(workspace, 'journeys/pull'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'journeys/pull/pull.rnjb'), '{}');
    await fs.writeFile(path.join(workspace, 'notes.txt'), 'ignored');
    await expect
      .poll(async () => (await changes(first.seq)).paths, { timeout: 5000 })
      .toEqual(['journeys/pull/pull.rnjb']);
    // A client that saw an earlier service (a higher cursor) gets everything again, not nothing.
    expect((await changes(first.seq + 1000)).paths).toEqual(['journeys/pull/pull.rnjb']);
  });
});

describe('export with the team template (§7.6)', () => {
  it('writes the dependencies imported from package.json into the exported package.json', async () => {
    await configureWorkspace();
    const dependencyTemplate = {
      library: { dependencies: { dayjs: '^1.11.0' }, devDependencies: {}, peerDependencies: {} },
      example: { dependencies: {} },
    };
    await fs.writeFile(
      path.join(workspace, 'rnjb.team.json'),
      JSON.stringify({ schemaVersion: 1, activePacks: [], libraries: [], dependencyTemplate }),
    );
    const document = applyBasicJourney(
      createDocument(
        {
          kind: 'journey',
          name: 'Pagos',
          slug: 'pagos',
          profile: { id: 'feature-library', version: '1.0.0' },
          libraries: [],
          platformVersion: '0.0.0-test',
          formatVersion: 1,
        },
        { now: () => '2026-01-01T00:00:00.000Z' },
      ),
      { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: ['success'] },
      {
        ids: {
          next: (() => {
            let n = 0;
            return () => `s${++n}`;
          })(),
        },
        clock: { now: () => '2026-01-01T00:00:00.000Z' },
      },
    );
    const response = await app.inject({
      method: 'POST',
      url: '/v1/export/plan',
      headers: authed,
      payload: { document: { ...document, integrity: 'x' }, target: path.join(tmp, 'out') },
    });
    expect(response.statusCode, response.body).toBe(200);
    const pkg = response
      .json()
      .plan.entries.find((entry: { path: string }) => entry.path === 'package.json');
    expect(JSON.parse(pkg.ours).dependencies).toEqual({ dayjs: '^1.11.0' });
    expect(JSON.parse(pkg.ours).peerDependencies).toMatchObject({
      react: '*',
      'react-native': '*',
    });

    // A broken team file stops the export with its own error instead of dropping the template.
    await fs.writeFile(path.join(workspace, 'rnjb.team.json'), '{ "schemaVersion": 1,');
    const broken = await app.inject({
      method: 'POST',
      url: '/v1/export/plan',
      headers: authed,
      payload: { document: { ...document, integrity: 'x' }, target: path.join(tmp, 'out') },
    });
    expect(broken.json().error?.code).toBe('RNJB-303');
  });
});
