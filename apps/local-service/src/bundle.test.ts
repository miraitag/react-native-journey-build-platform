import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const PORT = 4996;
const ORIGIN = 'http://localhost:5173';
const TOKEN = 'test-token-0123456789';
const authed = { host: `127.0.0.1:${PORT}`, origin: ORIGIN, authorization: `Bearer ${TOKEN}` };

let tmp: string;
let root: string;
let app: ReturnType<typeof buildServer>;

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-bundle-')));
  const workspace = path.join(tmp, 'workspace');
  root = path.join(tmp, 'ui-lib');
  await fs.mkdir(workspace);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: '@acme/ui', version: '1.2.3', source: 'src/index.ts' }),
  );
  await fs.writeFile(
    path.join(root, 'src', 'index.ts'),
    "export { Chip } from './Chip';\nexport const SHIM = 1;\n",
  );
  await fs.writeFile(
    path.join(root, 'src', 'Chip.tsx'),
    "import { View } from 'react-native';\nimport Svg from 'react-native-svg';\n" +
      'export function Chip() { return <View><Svg /></View>; }\n',
  );
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
    payload: {
      schemaVersion: 1,
      workspacePath: workspace,
      librarySources: { '@acme/ui': { type: 'localPath', path: root } },
    },
  });
});

afterEach(async () => {
  await app.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

const bundle = (pkg = '@acme/ui') =>
  app.inject({
    method: 'GET',
    url: `/v1/libraries/bundle?package=${encodeURIComponent(pkg)}`,
    headers: authed,
  });

interface Body {
  key: string;
  globalName: string;
  code: string;
  shims: string[];
}

describe('library web bundle (§7.1)', () => {
  it('compiles a self-contained script that reads the host runtime from __rnjb', async () => {
    const response = await bundle();
    expect(response.statusCode).toBe(200);
    const body = response.json<Body>();
    expect(body.key).toMatch(/^@acme\/ui@1\.2\.3\+[0-9a-f]{12}$/);
    expect(body.shims).toEqual(['react-native-svg']);
    expect(body.code).not.toMatch(/\brequire\(|\bimport\s*\(/);

    const Svg = () => null;
    const host = {
      React: {},
      ReactNative: { View: 'View' },
      jsx: {
        jsx: (type: unknown, props: { children?: unknown }) => ({ type, children: props.children }),
        jsxs: (type: unknown, props: { children?: unknown }) => ({
          type,
          children: props.children,
        }),
        Fragment: 'F',
      },
      // Shims are flagged as ES modules so `import Svg from` resolves their `default`.
      shims: { 'react-native-svg': { __esModule: true, default: Svg } },
    };
    const context = vm.createContext({ __rnjb: host });
    vm.runInContext(body.code, context);
    const exported = vm.runInContext(body.globalName, context) as Record<string, unknown>;
    expect(typeof exported['Chip']).toBe('function');
    expect(exported['SHIM']).toBe(1);
    const tree = (exported['Chip'] as () => { type: unknown; children: { type: unknown } })();
    expect(tree.type).toBe('View');
    expect(tree.children.type).toBe(Svg);
  });

  it('serves the cached bundle until a source file changes', async () => {
    const first = (await bundle()).json<Body>();
    expect((await bundle()).json<Body>().key).toBe(first.key);
    await fs.appendFile(path.join(root, 'src', 'index.ts'), 'export const EXTRA = 2;\n');
    const next = (await bundle()).json<Body>();
    expect(next.key).not.toBe(first.key);
    expect(next.code).toContain('EXTRA');
  });

  it('refuses packages without a configured source and sources without code', async () => {
    expect((await bundle('@acme/other')).statusCode).toBe(400);
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: '@acme/ui', version: '1.2.3', types: 'src/index.d.ts' }),
    );
    const response = await bundle();
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('RNJB-104');
  });
});
