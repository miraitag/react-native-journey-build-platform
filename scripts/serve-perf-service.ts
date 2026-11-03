/**
 * Starts the local service for the Playwright runs (plan §5.3) against an isolated temporary
 * home and workspace: the `journey-50` fixture plus small journeys (`mini-01`…`mini-25`)
 * that the e2e tests edit, delete and restore (one per test; the persistence test uses 01–10).
 * Run from the repo root after `pnpm fixtures`.
 */
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addScreen, applyCommand, createDocument, type CommandContext } from '@rnjb/core';
import { FORMAT_VERSION, serializeRnjb } from '@rnjb/document-schema';

const fixture = path.resolve('fixtures/journey-50/journey-50.rnjb');
const root = await mkdtemp(path.join(os.tmpdir(), 'rnjb-perf-'));
const home = path.join(root, 'home');
const workspace = path.join(root, 'workspace');

await mkdir(path.join(workspace, 'journeys/journey-50'), { recursive: true });
await mkdir(home, { recursive: true });
await copyFile(fixture, path.join(workspace, 'journeys/journey-50/journey-50.rnjb'));

let counter = 0;
const context: CommandContext = {
  ids: { next: () => `m${(++counter).toString(36).padStart(6, '0')}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};
const PACKAGE = '@rnjb-fixture/components';
const VERSION = '0.0.0-fixture';
for (let index = 1; index <= 25; index += 1) {
  const number = String(index).padStart(2, '0');
  const slug = `mini-${number}`;
  let doc = createDocument(
    {
      kind: 'journey',
      name: `Mini ${number}`,
      slug,
      profile: { id: index === 19 ? 'feature-library' : 'fixture-profile', version: '1.0.0' },
      libraries: [{ package: PACKAGE, version: VERSION, packId: 'fixture' }],
      platformVersion: '0.1.0',
      formatVersion: FORMAT_VERSION,
    },
    context.clock,
  );
  for (const [position, name] of ['Inicio', 'Detalle'].entries()) {
    doc = applyCommand(
      doc,
      addScreen({
        name,
        root: { package: PACKAGE, component: 'Screen', version: VERSION },
        position: { x: position * 480, y: 0 },
        initialStates: ['success'],
      }),
      context,
    ).document;
  }
  await mkdir(path.join(workspace, 'journeys', slug), { recursive: true });
  await writeFile(path.join(workspace, 'journeys', slug, `${slug}.rnjb`), await serializeRnjb(doc));
}

// A curated pack whose component fits nowhere on a plain screen: drops onto it are invalid.
await mkdir(path.join(workspace, 'packs/libraries'), { recursive: true });
await writeFile(
  path.join(workspace, 'packs/libraries/rnjb-fixture-strict.json'),
  JSON.stringify({
    schemaVersion: 1,
    kind: 'library',
    id: 'rnjb-fixture-strict',
    name: 'Strict fixture',
    version: '1.0.0',
    package: '@rnjb-fixture/strict',
    packageVersion: '1.0.0',
    components: [
      {
        name: 'Sello',
        origin: 'curated',
        props: [],
        nesting: { acceptsChildren: false, allowedParents: ['SoloEnTarjeta'] },
      },
    ],
  }),
);

await mkdir(path.join(workspace, 'packs/hooks'), { recursive: true });
await writeFile(
  path.join(workspace, 'packs/hooks/fixture.json'),
  JSON.stringify({
    schemaVersion: 1,
    id: 'fixture-hooks',
    name: 'Fixture hooks',
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
      {
        name: 'useEffect',
        importPath: 'react',
        library: 'react',
        signature: 'useEffect(effect, deps)',
        isEffect: true,
        allowedLayers: ['presentation'],
      },
    ],
  }),
);

// A real library on disk (a `localPath` source) for the extract -> add -> preview e2e.
const library = path.join(root, 'ui-lib');
await mkdir(path.join(library, 'src'), { recursive: true });
await writeFile(
  path.join(library, 'package.json'),
  JSON.stringify({
    name: '@rnjb-fixture/ui',
    version: '1.0.0',
    source: 'src/index.ts',
    peerDependencies: { react: '*', 'react-native': '*' },
  }),
);
await writeFile(path.join(library, 'src/index.ts'), "export { Chip } from './Chip';\n");
await writeFile(
  path.join(library, 'src/Chip.tsx'),
  [
    "import { Text } from 'react-native';",
    "export interface ChipProps { tone?: 'a' | 'b'; label?: string }",
    "export function Chip({ tone = 'a', label }: ChipProps) {",
    '  return <Text>{label ?? `chip-real-${tone}`}</Text>;',
    '}',
    '',
  ].join('\n'),
);

await writeFile(
  path.join(home, 'settings.json'),
  `${JSON.stringify({ schemaVersion: 1, workspacePath: workspace, librarySources: { '@rnjb-fixture/ui': { type: 'localPath', path: library } }, remoteSources: [], trashRetentionHours: 48 })}\n`,
  { mode: 0o600 },
);

process.env.RNJB_HOME = home;
process.env.RNJB_BROWSE_ROOT = root;
await import('../apps/local-service/src/main.ts');
