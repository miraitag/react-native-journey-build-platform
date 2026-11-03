import {
  applyBasicJourney,
  createDocument,
  type CommandContext,
  type RnjbDocument,
} from '@rnjb/core';
import { defaultProfile } from '@rnjb/profiles';
import { describe, expect, it } from 'vitest';
import { emitProject } from './emit.ts';

let counter = 0;
const ctx: CommandContext = {
  ids: { next: () => `id${++counter}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};

const doc: RnjbDocument = applyBasicJourney(
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

describe('emitProject', () => {
  it('generates the default profile layout for every screen', () => {
    const { files, missing } = emitProject(doc, defaultProfile);
    expect(missing).toEqual([]);
    const paths = Object.keys(files);
    expect(paths).toContain('src/public/index.ts');
    expect(paths).toContain('src/core/domain/result/result.ts');
    expect(paths).toContain('package.json');
    expect(paths.some((path) => path.endsWith('.screen.tsx'))).toBe(true);
    expect(paths.some((path) => path.endsWith('.view-model.ts'))).toBe(true);
    expect(paths.some((path) => path.endsWith('.ui-state.ts'))).toBe(true);
    // Public API (skills public-api rule): root barrel, feature component and its props only.
    expect(files['src/index.tsx']).toBe("export * from './public';\n");
    expect(files['src/public/index.ts']).toContain('export { Pagos }');
    expect(files['src/public/index.ts']).not.toContain('../private');
    expect(files['src/public/Pagos.tsx']).toContain('<PagosNavigator />');
  });

  it('is deterministic', () => {
    expect(emitProject(doc, defaultProfile).files).toEqual(emitProject(doc, defaultProfile).files);
  });

  it('lists components without a library instead of emitting them', () => {
    const screen = doc.screens[0];
    const root = screen?.nodes[screen.rootId];
    if (!screen || root?.kind !== 'component') return;
    const broken: RnjbDocument = {
      ...doc,
      screens: [
        {
          ...screen,
          nodes: {
            ...screen.nodes,
            [screen.rootId]: { ...root, ref: { ...root.ref, package: '' } },
          },
        },
        ...doc.screens.slice(1),
      ],
    };
    expect(emitProject(broken, defaultProfile).missing).toHaveLength(1);
  });

  it('emits props, forms, hooks and gateways', () => {
    const screen = doc.screens[0];
    const root = screen?.nodes[screen.rootId];
    if (!screen || root?.kind !== 'component') throw new Error('expected a component root');
    const rich: RnjbDocument = {
      ...doc,
      strings: { 'login.required': 'Obligatorio', title: 'Hola' },
      forms: [
        {
          id: 'f1',
          screenId: screen.id,
          name: 'Login',
          dynamic: false,
          fields: [
            {
              id: 'x',
              name: 'email',
              type: 'email',
              required: true,
              messages: { required: 'login.required' },
            },
          ],
        },
      ],
      data: {
        models: [{ id: 'm', name: 'User', fields: [{ name: 'id', type: 'string' }] }],
        gateways: [{ id: 'g', name: 'getUser', output: 'User', httpMethod: 'GET', path: '/user' }],
        blocks: [],
      },
      screens: [
        {
          ...screen,
          logic: {
            blocks: [],
            hooks: [
              {
                id: 'h',
                hook: 'useQuery',
                library: '@tanstack/react-query',
                version: '5',
                bindings: {},
                dependencies: [],
              },
              {
                id: 'h2',
                hook: 'useQuery',
                library: '@tanstack/react-query',
                version: '5',
                bindings: {},
                dependencies: [],
              },
              {
                id: 'h3',
                hook: 'useQuery',
                library: '@tanstack/react-query',
                version: '5',
                bindings: {},
                dependencies: ['h2'],
                body: { language: 'ts', source: 'refresh();', imports: [] },
              },
            ],
          },
          nodes: {
            ...screen.nodes,
            [screen.rootId]: {
              ...root,
              props: {
                title: { type: 'string', key: 'title' },
                onPress: { type: 'binding', source: 'handler', path: 'submit' },
              },
              spacing: { padding: { left: { type: 'literal', value: 8 } } },
            },
          },
        },
        ...doc.screens.slice(1),
      ],
    };
    const { files } = emitProject(rich, defaultProfile);
    const text = (suffix: string): string =>
      Object.entries(files).find(([path]) => path.endsWith(suffix))?.[1] ?? '';
    expect(text('.screen.tsx')).toContain('title={strings.title}');
    expect(text('.screen.tsx')).toContain('onPress={handlers.submit}');
    expect(text('.screen.tsx')).toContain('paddingLeft: 8');
    expect(text('.screen.tsx')).toContain('StyleSheet.create');
    expect(text('.screen.tsx')).not.toContain('style={{');
    expect(text('inicio.schema.ts')).toContain('createYupSchema<');
    expect(text('inicio.schema.ts')).toContain('yup.string().email().required(strings');
    expect(text('.view-model.ts')).toContain('useForm<');
    expect(text('.view-model.ts')).toContain("import { useQuery } from '@tanstack/react-query'");
    expect(text('.view-model.ts')).toContain('const queryResult2 = useQuery();');
    expect(text('.view-model.ts')).toContain('}, [queryResult2]);');
    expect(files['src/private/domain/model/user.domain-model.ts']).toContain(
      'interface UserDomainModel',
    );
    expect(files['src/private/data/gateway/pagos.gateway.impl.ts']).toContain('Result.success(');
    expect(files['src/private/domain/gateway/pagos.gateway.ts']).toContain(
      'Promise<Result<UserDomainModel, ServiceError>>',
    );
  });
});

describe('export snapshots per template (§23.4)', () => {
  // The «Journey básico» template as the app creates it, with fixed ids so the files are stable.
  it('Journey básico', () => {
    let next = 0;
    const template = applyBasicJourney(
      createDocument(
        {
          kind: 'journey',
          name: 'Journey básico',
          slug: 'journey-basico',
          profile: { id: 'feature-library', version: '1.0.0' },
          libraries: [],
          platformVersion: '0.0.0-test',
          formatVersion: 1,
        },
        ctx.clock,
      ),
      {
        screenNames: ['Inicio', 'Detalle', 'Resultado'],
        initialStates: defaultProfile.conventions.initialStates,
      },
      { ids: { next: () => `t${++next}` }, clock: ctx.clock },
    );
    expect(emitProject(template, defaultProfile).files).toMatchSnapshot();
  });
});
