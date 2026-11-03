import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emitProject } from '@rnjb/codegen';
import { applyBasicJourney, createDocument, type CommandContext } from '@rnjb/core';
import { openRnjb } from '@rnjb/document-schema';
import { defaultProfile } from '@rnjb/profiles';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importRepository } from './import.ts';
import { Workspace } from './workspace.ts';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-import-')));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

let counter = 0;
const ctx: CommandContext = {
  ids: { next: () => `id${++counter}` },
  clock: { now: () => '2026-01-01T00:00:00.000Z' },
};

/** A feature library as the exporter writes it, with three screens. */
async function exportedRepo(): Promise<string> {
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
  const repo = path.join(tmp, 'repo');
  for (const [file, contents] of Object.entries(emitProject(document, defaultProfile).files)) {
    await fs.mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await fs.writeFile(path.join(repo, file), contents);
  }
  return repo;
}

describe('importRepository', () => {
  it('turns an exported library into a journey in the workspace', async () => {
    const repo = await exportedRepo();
    await fs.mkdir(path.join(repo, 'node_modules/x'), { recursive: true });
    await fs.writeFile(path.join(repo, 'node_modules/x/index.ts'), 'export {}');
    await fs.writeFile(path.join(repo, 'src/helper.js'), 'export const x = 1;');

    const workspace = new Workspace(path.join(tmp, 'ws'));
    await workspace.ensureStructure();
    const result = await importRepository(
      repo,
      { name: 'Pagos importado', slug: 'pagos-importado' },
      workspace,
    );

    expect(result.path).toBe('journeys/pagos-importado/pagos-importado.rnjb');
    expect(result.report.screens.map((screen) => screen.name)).toEqual([
      'Inicio',
      'Detalle',
      'Resultado',
    ]);
    expect(result.report.keptWhole.some((file) => file.includes('node_modules'))).toBe(false);
    expect(result.skipped).toEqual(['src/helper.js']);
    expect(result.profile).toMatchObject({ id: 'feature-library', detected: true });
    const saved = await openRnjb(await workspace.read(result.path));
    expect(saved).toMatchObject({ ok: true, mode: 'edit' });
    expect(saved.ok && saved.document.screens).toHaveLength(3);

    await expect(
      importRepository(repo, { name: 'Otra vez', slug: 'pagos-importado' }, workspace),
    ).rejects.toMatchObject({ code: 'RNJB-002' });
  });

  it('writes nothing when the journey would not validate', async () => {
    const workspace = new Workspace(path.join(tmp, 'ws'));
    await workspace.ensureStructure();
    const repo = await exportedRepo();
    await expect(
      importRepository(repo, { name: 'x'.repeat(121), slug: 'largo' }, workspace),
    ).rejects.toMatchObject({ code: 'RNJB-405' });
    await expect(workspace.read('journeys/largo/largo.rnjb')).rejects.toMatchObject({
      code: 'RNJB-404',
    });
  });

  it('refuses a folder with no screens', async () => {
    const workspace = new Workspace(path.join(tmp, 'ws'));
    await workspace.ensureStructure();
    await fs.mkdir(path.join(tmp, 'empty'));
    await expect(
      importRepository(path.join(tmp, 'empty'), { name: 'Vacío', slug: 'vacio' }, workspace),
    ).rejects.toMatchObject({ code: 'RNJB-404' });
  });
});
