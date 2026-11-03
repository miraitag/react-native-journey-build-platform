import {
  applyBasicJourney,
  createDocument,
  type CommandContext,
  type RnjbDocument,
} from '@rnjb/core';
import { defaultProfile } from '@rnjb/profiles';
import { describe, expect, it } from 'vitest';
import { ts } from '@rnjb/ts-analysis';
import { emitProject } from './emit.ts';
import type { ProfilePack } from '@rnjb/pack-schema';
import { parseProject } from './parse.ts';

let counter = 0;
const ctx: CommandContext = {
  ids: { next: () => `id${++counter}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};
const base: RnjbDocument = applyBasicJourney(
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
    ctx.clock,
  ),
  { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: ['loading', 'success'] },
  ctx,
);

/** The basic journey's roots come from no library; give them one so they are importable. */
const withLibrary = (doc: RnjbDocument): RnjbDocument => ({
  ...doc,
  strings: { title: 'Hola', 'a.b': 'Dos' },
  data: {
    models: [
      {
        id: 'model-User',
        name: 'User',
        fields: [
          { name: 'age', type: 'number', optional: true },
          { name: 'id', type: 'string' },
        ],
      },
    ],
    gateways: [],
    blocks: [],
  },
  screens: doc.screens.map((screen) => {
    const nodes = { ...screen.nodes };
    const child = {
      id: `${screen.id}-c`,
      kind: 'component' as const,
      ref: { package: '@acme/ui', component: 'Button', version: '1.0.0' },
      props: {
        title: { type: 'string' as const, key: 'title' },
        count: { type: 'literal' as const, value: 3 },
        label: { type: 'literal' as const, value: 'ok' },
        disabled: { type: 'binding' as const, source: 'uiState' as const, path: 'busy' },
        color: { type: 'token' as const, group: 'colors', name: 'primary-500' },
        font: { type: 'token' as const, group: 'typography.heading', name: 'fontSize' },
        ...(screen.name === 'Inicio'
          ? {
              onPress: {
                type: 'binding' as const,
                source: 'handler' as const,
                path: 'goToDetalle',
              },
            }
          : {}),
      },
      children: [],
      layout: { flexDirection: 'row' as const, width: 120 },
      spacing: {
        padding: { left: { type: 'literal' as const, value: 8 } },
        gap: { type: 'token' as const, group: 'space', name: 'md' },
      },
    };
    const root = nodes[screen.rootId];
    if (root?.kind !== 'component') return screen;
    nodes[screen.rootId] = {
      ...root,
      ref: { package: '@acme/ui', component: 'Screen', version: '1.0.0' },
      children: [child.id],
    };
    nodes[child.id] = child;
    return { ...screen, nodes };
  }),
});

describe('parseProject', () => {
  const doc = withLibrary(base);
  const { files } = emitProject(doc, defaultProfile);
  const { project, report } = parseProject(files, defaultProfile);

  it('rebuilds screens, states, initial screen and strings', () => {
    expect(project.screens.map((screen) => screen.name)).toEqual([
      'Inicio',
      'Detalle',
      'Resultado',
    ]);
    expect(project.screens[1]?.states.map((state) => state.name)).toEqual(['loading', 'success']);
    expect(project.strings).toEqual(doc.strings);
    expect(project.models).toEqual(doc.data.models);
    expect(project.initialScreenId).toBe('screen-inicio');
  });

  it('keeps the screen order when Prettier wraps the navigator props', () => {
    const wrapped = Object.fromEntries(
      Object.entries(files).map(([path, text]) => [
        path,
        text.replaceAll('<Stack.Screen name=', '<Stack.Screen\n        name='),
      ]),
    );
    const parsed = parseProject(wrapped, defaultProfile).project;
    expect(parsed.screens.map((screen) => screen.name)).toEqual(['Inicio', 'Detalle', 'Resultado']);
  });

  it('rebuilds the node tree with props, layout and spacing', () => {
    const inicio = project.screens.find((screen) => screen.name === 'Inicio');
    const root = inicio?.nodes[inicio.rootId];
    if (root?.kind !== 'component') throw new Error('no root');
    expect(root.ref).toMatchObject({ package: '@acme/ui', component: 'Screen' });
    const child = inicio?.nodes[root.children[0] as string];
    if (child?.kind !== 'component') throw new Error('no child');
    expect(child.props).toMatchObject({
      title: { type: 'string', key: 'title' },
      count: { type: 'literal', value: 3 },
      label: { type: 'literal', value: 'ok' },
      disabled: { type: 'binding', source: 'uiState', path: 'busy' },
      color: { type: 'token', group: 'colors', name: 'primary-500' },
      font: { type: 'token', group: 'typography.heading', name: 'fontSize' },
    });
    expect(child.layout).toEqual({ flexDirection: 'row', width: 120 });
    expect(child.spacing).toEqual({
      padding: { left: { type: 'literal', value: 8 } },
      gap: { type: 'token', group: 'space', name: 'md' },
    });
  });

  it('recovers connections from the handler that triggers them', () => {
    expect(
      project.connections.map((connection) => [connection.fromScreenId, connection.toScreenId]),
    ).toEqual([
      ['screen-inicio', 'screen-detalle'],
      ['screen-detalle', 'screen-resultado'],
    ]);
    expect(project.connections[0]?.triggerNodeId).toBeDefined();
  });

  it('emitting the parsed project again gives the same files (round trip)', () => {
    const again = emitProject(
      {
        ...base,
        screens: project.screens,
        connections: project.connections,
        strings: project.strings,
        data: { models: project.models, gateways: [], blocks: [] },
        board: {
          positions: {},
          ...(project.initialScreenId ? { initialScreenId: project.initialScreenId } : {}),
        },
        libraries: [],
      },
      defaultProfile,
    ).files;
    for (const path of Object.keys(files).filter(
      (file) =>
        /\.(screen\.tsx|ui\.state\.ts|navigator\.tsx)$/.test(file) || file.endsWith('strings.ts'),
    ))
      expect(again[path]).toBe(files[path]);
  });

  it('emits only syntactically valid TypeScript', () => {
    for (const [path, text] of Object.entries(files).filter(([file]) => /\.tsx?$/.test(file))) {
      const { diagnostics } = ts.transpileModule(text, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.Preserve },
      });
      expect(
        diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
        path,
      ).toEqual([]);
    }
  });

  it('keeps unrecognized and partly read files whole and reports coverage', () => {
    const extra = { ...files, 'src/private/utils/helper.ts': 'export const x = 1;\n' };
    const parsed = parseProject(extra, defaultProfile);
    expect(parsed.report.keptWhole).toContain('src/private/utils/helper.ts');
    expect(
      parsed.project.blocks.some((block) => block.origin?.file === 'src/private/utils/helper.ts'),
    ).toBe(true);
    expect(report.screens.every((screen) => screen.coverage === 1)).toBe(true);
  });

  it('is deterministic', () => {
    expect(parseProject(files, defaultProfile).project).toEqual(project);
  });
});

/** A second layout, flat and with other suffixes, to prove nothing assumes the default one. */
const flatProfile: ProfilePack = {
  ...defaultProfile,
  id: 'flat-test',
  conventions: {
    ...defaultProfile.conventions,
    folders: {
      public: 'src/api',
      coreResult: 'src/core',
      coreError: 'src/core',
      domain: 'src/domain',
      data: 'src/infra',
      contexts: 'src/contexts',
      navigation: 'src/navigation',
      screens: 'src/ui',
      values: 'src/ui/values',
    },
    fileSuffixes: {
      ...defaultProfile.conventions.fileSuffixes,
      screen: '.view.tsx',
      viewModel: '.vm.ts',
      uiState: '.state.ts',
    },
  },
};

/** Every relative import must point at a file the export writes. */
function unresolvedImports(files: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (!/\.tsx?$/.test(path)) continue;
    for (const [, specifier] of text.matchAll(/from '(\.[^']*)'/g)) {
      const base = new URL(specifier as string, `file:///${path}`).pathname.slice(1);
      if (!['.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) => `${base}${ext}` in files))
        missing.push(`${path} -> ${specifier}`);
    }
  }
  return missing;
}

describe('one journey, two profiles (§23.4)', () => {
  const doc: RnjbDocument = {
    ...withLibrary(base),
    data: {
      ...withLibrary(base).data,
      gateways: [{ id: 'g', name: 'getUser', output: 'User', httpMethod: 'GET', path: '/user' }],
    },
  };

  for (const profile of [defaultProfile, flatProfile]) {
    it(`${profile.id}: every relative import resolves and the screens come back`, () => {
      const { files, missing } = emitProject(doc, profile);
      expect(missing).toEqual([]);
      expect(unresolvedImports(files)).toEqual([]);
      const parsed = parseProject(files, profile).project;
      expect(parsed.screens.map((screen) => screen.name)).toEqual([
        'Inicio',
        'Detalle',
        'Resultado',
      ]);
      expect(parsed.strings).toEqual(doc.strings);
    });
  }

  it('the layouts really differ', () => {
    const a = Object.keys(emitProject(doc, defaultProfile).files);
    const b = Object.keys(emitProject(doc, flatProfile).files);
    expect(b.some((path) => path.endsWith('.view.tsx'))).toBe(true);
    expect(a.filter((path) => b.includes(path)).sort()).toEqual([
      '.npmrc',
      'package.json',
      'src/index.tsx',
    ]);
  });
});
