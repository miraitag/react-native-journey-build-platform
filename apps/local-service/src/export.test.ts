import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { applyBasicJourney, createDocument, type CommandContext } from '@rnjb/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDocumentExport, planDocumentExport, runChecks } from './export.ts';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-export-')));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

let counter = 0;
const ctx: CommandContext = {
  ids: { next: () => `id${++counter}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};
const document = applyBasicJourney(
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
  { screenNames: ['Inicio', 'Detalle', 'Resultado'], initialStates: ['success'] },
  ctx,
);

const confirmAll = async (
  target: string,
  doc = document,
): Promise<[Record<string, string>, Record<string, string>]> => {
  const { plan, onDisk } = await planDocumentExport(doc, target, 'project');
  return [Object.fromEntries(plan.entries.map((entry) => [entry.path, entry.proposed])), onDisk];
};

describe('export', () => {
  it('plans a folder that does not exist yet as all new files', async () => {
    const { plan, missing } = await planDocumentExport(document, undefined, 'project');
    expect(missing).toEqual([]);
    expect(plan.entries.length).toBeGreaterThan(5);
    expect(plan.entries.every((entry) => entry.status === 'new')).toBe(true);
  });

  it('writes the files and a lock, and a second plan has nothing to do', async () => {
    const { written } = await applyDocumentExport(
      document,
      tmp,
      'project',
      ...(await confirmAll(tmp)),
    );
    expect(written.length).toBeGreaterThan(5);
    const lock = JSON.parse(await fs.readFile(path.join(tmp, '.rnjb/export.lock.json'), 'utf8'));
    expect(lock.profile.id).toBe('feature-library');

    const again = await planDocumentExport(document, tmp, 'project');
    expect(again.hasLock).toBe(true);
    expect(again.plan.entries.every((entry) => entry.status === 'unchanged')).toBe(true);
  });

  it('flags a file edited by hand and keeps the rest untouched', async () => {
    await applyDocumentExport(document, tmp, 'project', ...(await confirmAll(tmp)));
    const edited = path.join(tmp, 'src/public/index.ts');
    await fs.writeFile(edited, '// mine\n');
    const { plan } = await planDocumentExport(document, tmp, 'project');
    const changed = plan.entries.filter((entry) => entry.status !== 'unchanged');
    expect(changed.map((entry) => [entry.path, entry.status, entry.twoWay])).toEqual([
      ['src/public/index.ts', 'conflict', true],
    ]);
  });

  it('refuses to write over a file that changed after the plan, writing nothing', async () => {
    const [files, onDisk] = await confirmAll(tmp);
    await fs.mkdir(path.join(tmp, 'src/public'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'src/public/index.ts'), '// mine\n');
    await expect(
      applyDocumentExport(document, tmp, 'project', files, onDisk),
    ).rejects.toMatchObject({ code: 'RNJB-208' });
    await expect(fs.stat(path.join(tmp, 'package.json'))).rejects.toThrow();
  });

  it('only accepts paths the exporter generates', async () => {
    await expect(
      applyDocumentExport(document, tmp, 'project', { '../outside.txt': 'x' }, {}),
    ).rejects.toMatchObject({ code: 'RNJB-403' });
  });

  it('limits the export to src when asked', async () => {
    const { plan } = await planDocumentExport(document, undefined, 'src');
    expect(plan.entries.some((entry) => entry.path === 'package.json')).toBe(false);
  });
});

describe('3-way merge in a git repository (§16.3, §23.4)', () => {
  const run = promisify(execFile);
  const git = (...args: string[]) =>
    run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: tmp });
  const withStrings = (strings: Record<string, string>) => ({ ...document, strings });
  const STRINGS = 'src/private/values/strings.ts';
  const exportAll = async (doc: typeof document) =>
    applyDocumentExport(doc, tmp, 'project', ...(await confirmAll(tmp, doc)));
  const entryOf = async (doc: typeof document) =>
    (await planDocumentExport(doc, tmp, 'project')).plan.entries.find((e) => e.path === STRINGS);

  beforeEach(async () => {
    await git('init', '-b', 'main');
    await exportAll(withStrings({ a: 'A', m: 'M' }));
    await git('add', '.');
    await git('commit', '-m', 'export');
  });

  it('merges a hand edit and a journey change in different lines', async () => {
    const file = path.join(tmp, STRINGS);
    await fs.writeFile(file, `// nota del equipo\n${await fs.readFile(file, 'utf8')}`);
    const entry = await entryOf(withStrings({ a: 'A', m: 'M', z: 'Z' }));
    expect(entry?.status).toBe('merged');
    expect(entry?.proposed).toContain('// nota del equipo');
    expect(entry?.proposed).toContain("z: 'Z'");
  });

  it('reports a conflict when both change the same line', async () => {
    const file = path.join(tmp, STRINGS);
    await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace("a: 'A'", "a: 'Mine'"));
    const { dirty, plan } = await planDocumentExport(
      withStrings({ a: 'B', m: 'M' }),
      tmp,
      'project',
    );
    expect(dirty).toBe(true);
    expect(plan.entries.find((e) => e.path === STRINGS)?.status).toBe('conflict');
  });

  it('updates without conflicts when the last export was not committed yet', async () => {
    await exportAll(withStrings({ a: 'A2', m: 'M' }));
    expect((await entryOf(withStrings({ a: 'A3', m: 'M' })))?.status).toBe('update');
  });
});

describe('a destination that is not git and has no lock', () => {
  it('compares two ways, file by file', async () => {
    const [files] = await confirmAll(tmp);
    for (const [file, contents] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(tmp, file)), { recursive: true });
      await fs.writeFile(path.join(tmp, file), contents);
    }
    await fs.writeFile(path.join(tmp, 'src/public/index.ts'), '// mine\n');
    const { git, hasLock, plan } = await planDocumentExport(document, tmp, 'project');
    expect([git, hasLock]).toEqual([false, false]);
    expect(
      plan.entries.filter((e) => e.status !== 'unchanged').map((e) => [e.path, e.twoWay]),
    ).toEqual([['src/public/index.ts', true]]);
  });
});

describe('profile checks with the team skills (§16.4)', () => {
  /** A stand-in scanner: prints the report the real one prints, always exiting 0. */
  const scanner = async (root: string, skill: string, report: string) => {
    const dir = path.join(root, `acme-${skill}-skills/scripts`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'scan.mjs'), `console.log(${JSON.stringify(report)});\n`);
  };

  it('fails on a report with hits, passes a clean one and skips a scanner that is not installed', async () => {
    const skills = path.join(tmp, 'skills');
    await scanner(skills, 'architecture', 'ARCHITECTURE SCAN | scope: full\nclean: 23');
    const clean = await runChecks(document, tmp, skills);
    expect(clean.find((r) => r.id === 'skills-architecture')).toMatchObject({ ok: true });
    expect(clean.find((r) => r.id === 'skills-code-quality')).toMatchObject({
      ok: false,
      skipped: true,
    });

    // A project install (.github/skills) wins over the configured folder.
    await scanner(
      path.join(tmp, '.github/skills'),
      'architecture',
      'ARCHITECTURE SCAN\nIMPACT   HITS CATEGORY RULE\nHIGH     1    Names    naming-conventions',
    );
    const hits = await runChecks(document, tmp, skills);
    expect(hits.find((r) => r.id === 'skills-architecture')).toMatchObject({ ok: false });
    expect(hits.find((r) => r.id === 'skills-architecture')?.skipped).toBeUndefined();

    // Two installed skills of the same kind cannot be told apart: listed, not guessed.
    await scanner(path.join(tmp, '.github/skills'), 'other-architecture', 'clean');
    const ambiguous = await runChecks(document, tmp, skills);
    expect(ambiguous.find((r) => r.id === 'skills-architecture')).toMatchObject({ skipped: true });
  });
});
