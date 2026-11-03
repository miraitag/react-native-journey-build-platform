import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchSource } from './source-fetch.ts';

let cache: string;

beforeEach(async () => {
  cache = await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-fetch-'));
});

afterEach(async () => {
  await fs.rm(cache, { recursive: true, force: true });
});

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { code?: string }) => error.code,
  );

describe('fetchSource validation', () => {
  it('rejects git URLs that are not https or ssh (RNJB-105)', async () => {
    const source = { type: 'git', url: 'file:///etc', ref: 'main' } as const;
    expect(await code(fetchSource('@a/b', source, cache))).toBe('RNJB-105');
  });

  it.each(['--upload-pack=touch /tmp/x', '-b', '', 'a b', 'a;b'])(
    'rejects the git ref %j before running git',
    async (ref) => {
      const source = { type: 'git', url: 'https://example.com/r.git', ref } as const;
      expect(await code(fetchSource('@a/b', source, cache))).toBe('RNJB-101');
      expect(await fs.readdir(cache)).toEqual([]);
    },
  );

  it.each([
    { package: '--registry=http://evil', version: '1.0.0' },
    { package: '@a/b', version: '^1.0.0' },
    { package: '@a/b', version: 'latest' },
    { package: 'Bad Name', version: '1.0.0' },
  ])('rejects the registry source %j', async (fields) => {
    const source = { type: 'registry', ...fields } as const;
    expect(await code(fetchSource('@a/b', source, cache))).toBe('RNJB-101');
    expect(await fs.readdir(cache)).toEqual([]);
  });
});
