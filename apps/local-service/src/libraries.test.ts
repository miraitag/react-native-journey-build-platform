import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const PORT = 4998;
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-token-0123456789';
const authed = { host: `127.0.0.1:${PORT}`, origin: ORIGIN, authorization: `Bearer ${TOKEN}` };

let tmp: string;
let workspace: string;
let app: ReturnType<typeof buildServer>;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-lib-')));
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

const saveSettings = (librarySources: Record<string, unknown>) =>
  app.inject({
    method: 'PUT',
    url: '/v1/settings',
    headers: authed,
    payload: { schemaVersion: 1, workspacePath: workspace, librarySources },
  });

async function setup(range = '^2.0.0') {
  const root = path.join(tmp, 'ui-lib');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: '@acme/ui', version: '2.1.0', source: 'src/index.ts' }),
  );
  await fs.writeFile(path.join(root, 'src', 'index.ts'), "export { Chip } from './Chip';\n");
  await fs.writeFile(
    path.join(root, 'src', 'Chip.tsx'),
    "export interface ChipProps { tone?: 'a' | 'b'; label: string }\n" +
      "export function Chip({ tone = 'a' }: ChipProps) { return null; }\n",
  );
  expect((await saveSettings({ '@acme/ui': { type: 'localPath', path: root } })).statusCode).toBe(
    200,
  );
  await fs.writeFile(
    path.join(workspace, 'rnjb.team.json'),
    JSON.stringify({
      schemaVersion: 1,
      activePacks: [],
      libraries: [{ package: '@acme/ui', range }],
    }),
  );
}

const extract = (pkg = '@acme/ui') =>
  app.inject({
    method: 'POST',
    url: '/v1/libraries/extract',
    headers: authed,
    payload: { package: pkg },
  });

describe('libraries (§7.1)', () => {
  it('extracts, stores the pack and lists it', async () => {
    await setup();
    const response = await extract();
    expect(response.statusCode).toBe(200);
    expect(response.json().diff.addedComponents).toEqual(['Chip']);
    const stored = JSON.parse(
      await fs.readFile(path.join(workspace, 'packs/libraries/acme-ui.json'), 'utf8'),
    );
    expect(stored).toMatchObject({ kind: 'library', package: '@acme/ui', packageVersion: '2.1.0' });
    expect(
      stored.components[0].props.find((prop: { name: string }) => prop.name === 'tone'),
    ).toMatchObject({ kind: 'enum', default: 'a' });
    const listed = await app.inject({ url: '/v1/libraries/packs', headers: authed });
    expect(listed.json().packs.map((pack: { id: string }) => pack.id)).toEqual(['acme-ui']);
  });

  it('keeps curated data on a second extraction', async () => {
    await setup();
    await extract();
    const file = path.join(workspace, 'packs/libraries/acme-ui.json');
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    stored.components[0].editableTextProps = ['label'];
    await fs.writeFile(file, JSON.stringify(stored));
    const again = await extract();
    expect(again.json().diff.changedComponents).toEqual([]);
    expect(again.json().pack.components[0].editableTextProps).toEqual(['label']);
  });

  it('rejects a version outside the team range (RNJB-103)', async () => {
    await setup('^3.0.0');
    const response = await extract();
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('RNJB-103');
  });

  it('rejects a library without configured source (RNJB-101)', async () => {
    await setup();
    expect((await extract('@acme/none')).json().error.code).toBe('RNJB-101');
  });

  it('refuses a source outside the allowed base', async () => {
    await setup();
    await saveSettings({ '@acme/ui': { type: 'localPath', path: '/etc' } });
    expect((await extract()).statusCode).toBe(403);
  });
});
