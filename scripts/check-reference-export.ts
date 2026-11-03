/**
 * Plan §23.4: the reference exports install, typecheck, lint and pass the profile checks. Each
 * reference journey is exported to a temporary folder, given the dev tooling a feature library
 * repository already has (tsconfig, eslint config, type packages), installed and checked with
 * the profile's own checks. Needs network for the install. Run from the repo root.
 * `RNJB_SKILLS_PATH` points at the installed skills when they are not in ~/.copilot/skills (the
 * install path of their README); `RNJB_DESIGN_SYSTEM` names the team's design system package.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { emitProject } from '@rnjb/codegen';
import { applyBasicJourney, createDocument, type RnjbDocument } from '@rnjb/core';
import { defaultProfile } from '@rnjb/profiles';
import { runChecks } from '../apps/local-service/src/export.ts';

const run = promisify(execFile);
const clock = { now: () => '2026-01-01T00:00:00.000Z' };

/** Versions for every peer the generated code can import; a missing one fails the check. */
const VERSIONS: Record<string, string> = {
  react: '^19.1.0',
  'react-native': '^0.81.0',
  '@react-navigation/native': '^7.1.0',
  '@react-navigation/native-stack': '^7.3.0',
  'react-hook-form': '^7.62.0',
  '@hookform/resolvers': '^5.2.0',
  yup: '^1.7.0',
};
/**
 * The team template as «Importar package.json» would leave it: the design system included. Team
 * skills may require their own design system by name; `RNJB_DESIGN_SYSTEM` gives it.
 */
const DESIGN_SYSTEM = process.env['RNJB_DESIGN_SYSTEM'] ?? '@acme/design-system';
const PRIVATE = [DESIGN_SYSTEM];
const TEAM = {
  library: { dependencies: { [DESIGN_SYSTEM]: '*' }, devDependencies: {}, peerDependencies: {} },
  example: { dependencies: {} },
};
const TOOLING: Record<string, string> = {
  typescript: '^5.9.0',
  '@types/react': '^19.1.0',
  eslint: '^9.35.0',
  'typescript-eslint': '^8.44.0',
};

function basic(slug: string): RnjbDocument {
  let next = 0;
  return applyBasicJourney(
    createDocument(
      {
        kind: 'journey',
        name: slug,
        slug,
        profile: { id: defaultProfile.id, version: defaultProfile.version },
        libraries: [],
        platformVersion: '0.0.0-ref',
        formatVersion: 1,
      },
      clock,
    ),
    {
      screenNames: ['Inicio', 'Detalle', 'Resultado'],
      initialStates: defaultProfile.conventions.initialStates,
    },
    { ids: { next: () => `r${++next}` }, clock },
  );
}

/** Forms, data, texts and tokens on top of the basic journey. */
function rich(): RnjbDocument {
  const doc = basic('pagos-referencia');
  const [first] = doc.screens;
  if (!first) throw new Error('no screen');
  const root = first.nodes[first.rootId];
  if (root?.kind !== 'component') throw new Error('no root');
  return {
    ...doc,
    strings: { title: 'Pagar', 'errors.required': 'Obligatorio', 'errors.code': 'Código inválido' },
    // Inicio passes the payment reference to Detalle (typed route params).
    connections: doc.connections.map((connection, index) =>
      index === 0 ? { ...connection, params: [{ name: 'reference', type: 'string' }] } : connection,
    ),
    forms: [
      {
        id: 'f',
        name: 'Pago',
        screenId: first.id,
        mode: 'onTouched',
        dynamic: false,
        fields: [
          {
            id: 'email',
            name: 'email',
            type: 'email',
            required: true,
            messages: { required: 'errors.required' },
          },
          {
            id: 'code',
            name: 'code',
            type: 'string',
            required: false,
            pattern: '^[0-9]{6}$',
            messages: { pattern: 'errors.code' },
          },
          { id: 'amount', name: 'amount', type: 'number', required: false, min: 1, messages: {} },
        ],
      },
    ],
    data: {
      models: [{ id: 'm', name: 'Receipt', fields: [{ name: 'id', type: 'string' }] }],
      gateways: [
        {
          id: 'g',
          name: 'pay',
          output: 'Receipt',
          httpMethod: 'POST',
          path: '/pay',
          input: 'Receipt',
        },
      ],
      blocks: [],
    },
    screens: [
      {
        ...first,
        nodes: {
          ...first.nodes,
          title: {
            id: 'title',
            kind: 'component',
            ref: { package: 'react-native', component: 'Text', version: '*' },
            props: { accessibilityLabel: { type: 'string', key: 'title' } },
            children: [],
            layout: {},
            spacing: { padding: { top: { type: 'token', group: 'space', name: 'md' } } },
          },
          pay: {
            id: 'pay',
            kind: 'component',
            ref: { package: 'react-native', component: 'Pressable', version: '*' },
            props: { onPress: { type: 'binding', source: 'handler', path: 'submit' } },
            children: [],
            layout: {},
            spacing: {},
          },
          [first.rootId]: { ...root, children: [...root.children, 'title', 'pay'] },
        },
      },
      ...doc.screens.slice(1, 2).map((screen) => {
        const detailRoot = screen.nodes[screen.rootId];
        if (detailRoot?.kind !== 'component') return screen;
        return {
          ...screen,
          nodes: {
            ...screen.nodes,
            reference: {
              id: 'reference',
              kind: 'component' as const,
              ref: { package: 'react-native', component: 'Text', version: '*' },
              props: {
                accessibilityLabel: {
                  type: 'binding' as const,
                  source: 'param' as const,
                  path: 'reference',
                },
              },
              children: [],
              layout: {},
              spacing: {},
            },
            [screen.rootId]: { ...detailRoot, children: [...detailRoot.children, 'reference'] },
          },
        };
      }),
      ...doc.screens.slice(2),
    ],
  };
}

async function check(doc: RnjbDocument, root: string): Promise<boolean> {
  const dir = path.join(root, doc.meta.slug);
  const { files, missing } = emitProject(doc, defaultProfile, { dependencyTemplate: TEAM });
  if (missing.length > 0) throw new Error(`missing codecs: ${JSON.stringify(missing)}`);
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), contents);
  }
  type Deps = Record<string, string>;
  const pkg = JSON.parse(files['package.json'] as string) as {
    dependencies: Deps;
    peerDependencies: Deps;
  };
  const needed = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)].filter(
    (name) => !PRIVATE.includes(name),
  );
  const unknown = needed.filter((name) => !VERSIONS[name]);
  if (unknown.length > 0) throw new Error(`no reference version for ${unknown.join(', ')}`);
  // What the feature library repository provides around the generated code. Private packages
  // (the design system) cannot be installed here, so they are left out of the install only.
  const pinned = (deps: Deps) =>
    Object.fromEntries(
      Object.keys(deps)
        .filter((name) => !PRIVATE.includes(name))
        .map((name) => [name, VERSIONS[name] as string]),
    );
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      ...pkg,
      dependencies: pinned(pkg.dependencies),
      peerDependencies: pinned(pkg.peerDependencies),
      devDependencies: { ...pinned(pkg.peerDependencies), ...TOOLING },
    }),
  );
  await writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        jsx: 'react-jsx',
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'es2022',
        skipLibCheck: true,
      },
      include: ['src'],
    }),
  );
  await writeFile(
    path.join(dir, 'eslint.config.mjs'),
    "import tseslint from 'typescript-eslint';\nexport default tseslint.config(...tseslint.configs.recommended);\n",
  );
  await run('pnpm', ['install', '--ignore-scripts', '--ignore-workspace', '--reporter=silent'], {
    cwd: dir,
    timeout: 10 * 60_000,
  });
  // The scanners read the package.json as exported, design system included.
  await writeFile(path.join(dir, 'package.json'), files['package.json'] as string);
  const results = await runChecks(doc, dir, process.env['RNJB_SKILLS_PATH']);
  for (const result of results) {
    const status = result.skipped ? 'skip' : result.ok ? 'ok  ' : 'FAIL';
    console.log(
      `${status} ${doc.meta.slug} ${result.id}${result.skipped ? ` (${result.output})` : ''}`,
    );
    if (!result.ok && !result.skipped) console.log(result.output);
  }
  // Skills scanners run when the CI machine has them installed (§16.4).
  return results.every((result) => result.ok || result.skipped);
}

// `RNJB_KEEP_EXPORTS=<dir>` leaves the exported projects there, for inspection.
const keep = process.env['RNJB_KEEP_EXPORTS'];
const root = keep ?? (await mkdtemp(path.join(os.tmpdir(), 'rnjb-reference-')));
try {
  const results = [];
  for (const doc of [basic('journey-basico'), rich()]) results.push(await check(doc, root));
  if (!results.every(Boolean)) process.exitCode = 1;
} finally {
  if (!keep) await rm(root, { recursive: true, force: true });
}
