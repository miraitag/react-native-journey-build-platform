import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const PORT = 4996;
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-token-0123456789';
const authed = { host: `127.0.0.1:${PORT}`, origin: ORIGIN, authorization: `Bearer ${TOKEN}` };

let tmp: string;
let workspace: string;
let app: ReturnType<typeof buildServer>;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-hooks-')));
  workspace = path.join(tmp, 'workspace');
  await fs.mkdir(workspace);
  app = buildServer({
    port: PORT,
    allowedOrigins: [ORIGIN],
    token: TOKEN,
    settings: new SettingsStore(path.join(tmp, 'home')),
    browseRoot: tmp,
  });
  await app.inject({
    method: 'PUT',
    url: '/v1/settings',
    headers: authed,
    payload: { schemaVersion: 1, workspacePath: workspace, librarySources: {} },
  });
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

const pack = {
  schemaVersion: 1,
  id: 'test-hooks',
  name: 'Test hooks',
  version: '1.0.0',
  kind: 'hooks',
  hooks: [
    {
      name: 'useQuery',
      importPath: '@tanstack/react-query',
      library: '@tanstack/react-query',
      signature: 'useQuery(options)',
      isEffect: false,
      allowedLayers: ['presentation', 'data'],
    },
  ],
};

describe('hooks packs (§7.5)', () => {
  it('lists valid packs and reports invalid files', async () => {
    await fs.mkdir(path.join(workspace, 'packs/hooks'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'packs/hooks/a.json'), JSON.stringify(pack));
    await fs.writeFile(path.join(workspace, 'packs/hooks/b.json'), '{"kind":"hooks"}');
    const response = await app.inject({ method: 'GET', url: '/v1/hooks/packs', headers: authed });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ packs: { id: string }[]; invalid: { path: string }[] }>();
    expect(body.packs.map((entry) => entry.id)).toEqual(['test-hooks']);
    expect(body.invalid).toEqual([{ path: 'packs/hooks/b.json' }]);
  });

  it('returns nothing when the workspace has no hooks packs', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/hooks/packs', headers: authed });
    expect(response.json()).toEqual({ packs: [], invalid: [] });
  });
});
