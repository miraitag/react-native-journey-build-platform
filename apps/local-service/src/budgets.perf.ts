import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openRnjb, serializeRnjb } from '@rnjb/document-schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDocumentExport, planDocumentExport } from './export.ts';
import { importRepository } from './import.ts';
import { Workspace } from './workspace.ts';

/** Service budgets of plan §5.1 on `journey-50` (50 screens × 200 nodes); §5.3 fails the run. */
const BUDGET = { export: 5_000, import: 30_000, index: 1_000 };

let tmp: string;
beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'rnjb-perf-')));
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const timed = async <T>(work: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const result = await work();
  return [result, performance.now() - start];
};

describe('service budgets (§5.1)', () => {
  it('exports and imports journey-50 within budget', async () => {
    const opened = await openRnjb(
      await fs.readFile(path.resolve('fixtures/journey-50/journey-50.rnjb'), 'utf8'),
    );
    if (!opened.ok) throw opened.error;
    // The fixture profile is not a built-in one; the default profile has every codec.
    const document = {
      ...opened.document,
      profile: { id: 'feature-library', version: '1.0.0' },
    };
    const target = path.join(tmp, 'library');
    await fs.mkdir(target);

    const [, exportMs] = await timed(async () => {
      const { plan, onDisk } = await planDocumentExport(document, target, 'project');
      const chosen = Object.fromEntries(plan.entries.map((entry) => [entry.path, entry.proposed]));
      await applyDocumentExport(document, target, 'project', chosen, onDisk);
    });
    expect(exportMs, 'export 50 screens').toBeLessThan(BUDGET.export);

    const workspace = new Workspace(path.join(tmp, 'ws'));
    await workspace.ensureStructure();
    const [imported, importMs] = await timed(() =>
      importRepository(target, { name: 'Import 50', slug: 'import-50' }, workspace),
    );
    expect(importMs, 'import 50 screens').toBeLessThan(BUDGET.import);
    expect(imported.report.screens).toHaveLength(50);
  }, 60_000);

  it('indexes 200 workspace files within budget', async () => {
    const source = await fs.readFile(path.resolve('fixtures/journey-50/journey-50.rnjb'), 'utf8');
    const opened = await openRnjb(source);
    if (!opened.ok) throw opened.error;
    // Small journeys, as most workspace files are; the index reads every one of them.
    const small = { ...opened.document, screens: opened.document.screens.slice(0, 2) };
    const workspace = new Workspace(path.join(tmp, 'index'));
    await workspace.ensureStructure();
    for (let index = 0; index < 200; index += 1) {
      const slug = `j-${index}`;
      const text = await serializeRnjb({ ...small, meta: { ...small.meta, slug } });
      await fs.mkdir(path.join(workspace.root, 'journeys', slug), { recursive: true });
      await fs.writeFile(path.join(workspace.root, 'journeys', slug, `${slug}.rnjb`), text);
    }
    const [result, indexMs] = await timed(() => workspace.index());
    expect(result.entries).toHaveLength(200);
    expect(indexMs, 'index 200 files').toBeLessThan(BUDGET.index);
  }, 60_000);
});
