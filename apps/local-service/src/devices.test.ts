import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const PORT = 4997;
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-token-0123456789';
const authed = { host: `127.0.0.1:${PORT}`, origin: ORIGIN, authorization: `Bearer ${TOKEN}` };

let tmp: string;
let workspace: string;
let app: ReturnType<typeof buildServer>;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-dev-')));
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
  id: 'test-devices',
  name: 'Test devices',
  version: '1.0.0',
  kind: 'devices',
  usageSource: { provider: 'Test', url: 'https://example.com/usage', cutoffDate: '2026-01-01' },
  devices: [
    {
      id: 'test-phone',
      name: 'Test phone',
      platform: 'ios',
      osVersions: ['26'],
      defaultOsVersion: '26',
      logicalSize: { width: 400, height: 800 },
      density: 3,
      cornerRadius: 40,
      cutouts: [],
      safeArea: {
        portrait: { top: 50, right: 0, bottom: 30, left: 0 },
        landscape: { top: 0, right: 50, bottom: 20, left: 50 },
      },
      statusBarHeight: 50,
      bottomChrome: 'home-indicator',
      specSource: 'https://example.com/spec',
      reviewedAt: '2026-01-01',
    },
  ],
  chromeStyles: [],
};

describe('devices packs (§12)', () => {
  it('lists valid packs and reports invalid files', async () => {
    await fs.mkdir(path.join(workspace, 'packs/devices'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'packs/devices/a.json'), JSON.stringify(pack));
    await fs.writeFile(path.join(workspace, 'packs/devices/b.json'), '{"kind":"devices"}');
    const response = await app.inject({
      method: 'GET',
      url: '/v1/devices/packs',
      headers: authed,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ packs: { id: string }[]; invalid: { path: string }[] }>();
    expect(body.packs.map((entry) => entry.id)).toEqual(['builtin-devices', 'test-devices']);
    expect(body.invalid).toEqual([{ path: 'packs/devices/b.json' }]);
  });
});
