import { describe, expect, it } from 'vitest';
import { importPackageJson } from './import-package-json.ts';
import { validateLocalSettings, validatePack, validateTeamConfig } from './validate.ts';

describe('validatePack', () => {
  it('accepts a minimal library pack', () => {
    const result = validatePack({
      schemaVersion: 1,
      kind: 'library',
      id: 'rn-core',
      name: 'React Native',
      version: '1.0.0',
      package: 'react-native',
      packageVersion: '0.0.0-test',
      components: [
        {
          name: 'View',
          origin: 'extracted',
          props: [
            { name: 'testID', type: 'string', kind: 'string', optional: true, origin: 'extracted' },
          ],
          nesting: { acceptsChildren: true },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('reports the exact path of an invalid field', () => {
    const result = validatePack({
      schemaVersion: 1,
      kind: 'hooks',
      id: 'hooks',
      name: 'Hooks',
      version: '1.0.0',
      hooks: [
        {
          name: 'useThing',
          importPath: 'x',
          library: 'x',
          signature: '() => void',
          isEffect: false,
          allowedLayers: [],
        },
      ],
    });
    expect(!result.ok && result.error.code).toBe('RNJB-301');
    expect(!result.ok && result.error.params.path).toBe('hooks[0].allowedLayers');
  });

  it('rejects unknown pack kinds', () => {
    expect(
      validatePack({ schemaVersion: 1, kind: 'theme', id: 'x', name: 'x', version: '1' }).ok,
    ).toBe(false);
  });
});

describe('rnjb.team.json and settings', () => {
  it('validates a team config', () => {
    const result = validateTeamConfig({
      schemaVersion: 1,
      activePacks: ['rn-core'],
      libraries: [{ package: 'react-native', range: '^0.80.0' }],
      defaultProfile: 'feature-library',
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['https://bitbucket.org/team/repo.git', true],
    ['ssh://git@bitbucket.example:7999/team/repo.git', true],
    ['http://bitbucket.org/team/repo.git', false],
    ['file:///tmp/repo', false],
    ['ext::sh -c touch% /tmp/pwned', false],
    ['git@bitbucket.org:team/repo.git', false],
    ['ssh://git@bitbucket.org/team/repo.git', true],
    ['https://x-token-auth:SECRET@bitbucket.org/team/repo.git', false],
    ['https://SECRET@bitbucket.org/team/repo.git', false],
  ])('git source %s → %s', (url, valid) => {
    const result = validateLocalSettings({
      schemaVersion: 1,
      librarySources: { lib: { type: 'git', url, ref: 'main' } },
    });
    expect(result.ok).toBe(valid);
  });

  it('fills defaults for empty settings', () => {
    const result = validateLocalSettings({ schemaVersion: 1 });
    expect(result.ok && result.value).toMatchObject({
      librarySources: {},
      remoteSources: [],
      trashRetentionHours: 48,
    });
  });
});

describe('importPackageJson', () => {
  it('proposes libraries and the dependency template only from the files', () => {
    const result = importPackageJson(
      {
        name: '@team/feature',
        dependencies: { yup: '^1.0.0', 'local-thing': 'workspace:*' },
        devDependencies: { typescript: '^5.0.0' },
        peerDependencies: { react: '*', 'react-native': '*', yup: '>=1' },
      },
      { dependencies: { 'react-native-screens': '^4.0.0', '@team/feature': 'link:..' } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.libraries).toEqual([
      { package: 'react', range: '*' },
      { package: 'react-native', range: '*' },
      { package: 'yup', range: '>=1' },
    ]);
    expect(result.value.dependencyTemplate.example.dependencies).toEqual({
      'react-native-screens': '^4.0.0',
    });
    expect(result.value.skipped.map((entry) => entry.package)).toEqual([
      'local-thing',
      '@team/feature',
    ]);
  });

  it('rejects malformed files with RNJB-502', () => {
    const result = importPackageJson({ dependencies: { a: 1 } });
    expect(!result.ok && result.error.code).toBe('RNJB-502');
  });
});
