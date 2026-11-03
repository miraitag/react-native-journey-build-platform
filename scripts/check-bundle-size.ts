/**
 * Plan §5.1: initial JS < 300 KB gzip, without Monaco or library bundles. Builds the web app for
 * production (the perf run uses the profiling React build, which is larger) and sums the gzip
 * size of the scripts `index.html` loads up front: the entry and its module preloads.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const BUDGET = 300 * 1024;
const out = await mkdtemp(path.join(os.tmpdir(), 'rnjb-bundle-'));
try {
  await promisify(execFile)('pnpm', ['exec', 'vite', 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: 'apps/web',
    env: { ...process.env, RNJB_PROFILE: '' },
  });
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
    (m) => m[1] as string,
  );
  let total = 0;
  for (const script of scripts) {
    const size = gzipSync(await readFile(path.join(out, script)), { level: 9 }).length;
    total += size;
    console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${script}`);
  }
  console.log(
    `${(total / 1024).toFixed(1).padStart(7)} KB  initial JS (budget ${BUDGET / 1024} KB)`,
  );
  if (scripts.length === 0 || total > BUDGET) process.exitCode = 1;
} finally {
  await rm(out, { recursive: true, force: true });
}
