import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyCommand, createDocument, type CommandContext } from '@rnjb/core';
import { serializeRnjb } from '@rnjb/document-schema';
import type { RemoteSource } from '@rnjb/pack-schema';
import { readRemoteFile, syncRemote } from './remote-sync.ts';

const run = promisify(execFile);
let base: string;
let repo: string;
let cache: string;

const context: CommandContext = {
  ids: { next: () => 'id' },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};

const git = (...args: string[]) =>
  run('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: repo });

async function journey(kind: 'journey' | 'template', slug: string, name = slug): Promise<string> {
  const document = applyCommand(
    createDocument(
      {
        kind,
        name,
        slug,
        profile: { id: 'p', version: '1.0.0' },
        libraries: [],
        platformVersion: '0.0.0-test',
        formatVersion: 1,
      },
      context.clock,
    ),
    () => undefined,
    context,
  ).document;
  return serializeRnjb(document);
}

async function put(relative: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
  await fs.writeFile(path.join(repo, relative), contents);
}

const source = (extra: Partial<RemoteSource> = {}): RemoteSource => ({
  id: 'r1',
  name: 'Equipo',
  remote: `file://${repo}`,
  ref: 'main',
  path: '',
  provider: 'git',
  ...extra,
});

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-remote-'));
  repo = path.join(base, 'repo');
  cache = path.join(base, 'cache');
  await fs.mkdir(repo);
  await git('init', '-b', 'main');
  await put('journeys/loans/loans.rnjb', await journey('journey', 'loans'));
  await put('templates/basic/basic.rnjb', await journey('template', 'basic'));
  await put('README.md', 'not synchronized');
  await git('add', '.');
  await git('commit', '-m', 'first');
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { code?: string }) => error.code,
  );

describe('syncRemote', () => {
  it('clones shallow and sparse and lists journeys and templates as remote entries', async () => {
    const result = await syncRemote(source(), cache, { allowFile: true });
    const head = (await git('rev-parse', 'HEAD')).stdout.trim();

    expect(result.commit).toBe(head);
    expect(result.stale).toBe(false);
    expect(result.entries.map((entry) => entry.path).sort()).toEqual([
      'journeys/loans/loans.rnjb',
      'templates/basic/basic.rnjb',
    ]);
    for (const entry of result.entries) {
      expect(entry.origin).toBe('remote');
      expect(entry.remote).toMatchObject({ ref: 'main', commit: head });
    }
    const clone = (await fs.readdir(path.join(cache, 'remotes')))[0] as string;
    await expect(fs.stat(path.join(cache, 'remotes', clone, 'README.md'))).rejects.toThrow();
  });

  it('gives each file the last commit that touched it', async () => {
    const first = await syncRemote(source(), cache, { allowFile: true });
    await put('templates/basic/basic.rnjb', await journey('template', 'basic', 'Cambiada'));
    await git('commit', '-am', 'change template');
    const second = await syncRemote(source(), cache, { allowFile: true });

    const of = (result: typeof first, file: string) =>
      result.entries.find((entry) => entry.path === file)?.remote?.commit;
    expect(of(second, 'journeys/loans/loans.rnjb')).toBe(of(first, 'journeys/loans/loans.rnjb'));
    expect(of(second, 'templates/basic/basic.rnjb')).not.toBe(
      of(first, 'templates/basic/basic.rnjb'),
    );
    expect(second.entries.find((entry) => entry.slug === 'basic')?.name).toBe('Cambiada');
  });

  it('only lists the configured folder', async () => {
    await put('team-a/journeys/x/x.rnjb', await journey('journey', 'xyz'));
    await git('add', '.');
    await git('commit', '-m', 'team a');
    const result = await syncRemote(source({ path: 'team-a' }), cache, { allowFile: true });
    expect(result.entries.map((entry) => entry.slug)).toEqual(['xyz']);
    expect(result.entries[0]?.remote?.path).toBe('team-a/journeys/x/x.rnjb');
  });

  it('keeps the cached copy when the remote cannot be reached', async () => {
    await syncRemote(source(), cache, { allowFile: true });
    await fs.rm(repo, { recursive: true, force: true });
    const result = await syncRemote(source(), cache, { allowFile: true });
    expect(result.stale).toBe(true);
    expect(result.entries).toHaveLength(2);
  });

  it('fails with RNJB-108 when a first clone is impossible and leaves nothing behind', async () => {
    await fs.rm(repo, { recursive: true, force: true });
    expect(await code(syncRemote(source(), cache, { allowFile: true }))).toBe('RNJB-108');
    expect(await fs.readdir(path.join(cache, 'remotes'))).toEqual([]);
  });

  it('rejects other schemes and unsafe refs before running git', async () => {
    expect(await code(syncRemote(source(), cache))).toBe('RNJB-105');
    expect(
      await code(syncRemote(source({ ref: '--upload-pack=x' }), cache, { allowFile: true })),
    ).toBe('RNJB-108');
    await expect(fs.stat(cache)).rejects.toThrow();
  });

  it('rejects a folder that escapes the clone', async () => {
    await syncRemote(source(), cache, { allowFile: true });
    expect(await code(syncRemote(source({ path: '../../etc' }), cache, { allowFile: true }))).toBe(
      'RNJB-403',
    );
  });
});

describe('readRemoteFile', () => {
  it('reads an entry of a synchronized source', async () => {
    await syncRemote(source(), cache, { allowFile: true });
    const text = await readRemoteFile(source(), cache, 'journeys/loans/loans.rnjb');
    expect(JSON.parse(text).meta.slug).toBe('loans');
  });

  it('only reads journeys and templates, and never outside the clone', async () => {
    await syncRemote(source(), cache, { allowFile: true });
    for (const relative of ['README.md', '../x.rnjb', 'journeys/../../../etc/passwd']) {
      expect(await code(readRemoteFile(source(), cache, relative))).toBe('RNJB-403');
    }
  });

  it('says so when the source was never synchronized', async () => {
    expect(await code(readRemoteFile(source(), cache, 'journeys/loans/loans.rnjb'))).toBe(
      'RNJB-404',
    );
  });
});
