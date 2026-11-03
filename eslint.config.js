import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Each workspace lints from its own folder; paths here are relative to this file.
const root = import.meta.dirname;

/** The domain must stay framework-free (plan §2.9). */
const DOMAIN = ['packages/core', 'packages/document-schema', 'packages/pack-schema'];

/**
 * Layers (plan §4) come from each workspace's package.json: it may import only the `@rnjb/*`
 * packages it declares, never an app, and never another workspace through a relative path.
 */
const boundaries = ['apps', 'packages']
  .flatMap((dir) => readdirSync(path.join(root, dir)).map((name) => `${dir}/${name}`))
  // Skips stray entries such as macOS `.DS_Store`.
  .filter((workspace) => existsSync(path.join(root, workspace, 'package.json')))
  .map((workspace) => {
    const pkg = JSON.parse(readFileSync(path.join(root, workspace, 'package.json'), 'utf8'));
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((name) =>
      name.startsWith('@rnjb/'),
    );
    return {
      files: [`${workspace}/**`],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@rnjb/*', ...declared.map((name) => `!${name}`)],
                message: `Not a dependency of ${pkg.name}: declare it in package.json if this layer may use it.`,
              },
              {
                // `../../core/src/…`: reaching into another workspace's sources.
                regex: '^(\\.\\./)+[^./][^/]*/src/',
                message: 'Import another workspace by its package name.',
              },
              ...(DOMAIN.includes(workspace)
                ? [
                    {
                      group: ['react', 'react-dom', 'react/*', 'node:*', 'fastify'],
                      message: 'The domain stays framework-free (plan §2.9).',
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    };
  });

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', 'fixtures/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/**/*.tsx', 'packages/ui/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  ...boundaries,
  {
    // CLI scripts and the perf report print to stdout on purpose.
    files: ['scripts/**', 'apps/web/e2e/**'],
    rules: { 'no-console': 'off' },
  },
);
