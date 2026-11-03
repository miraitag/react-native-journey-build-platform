import { Worker } from 'node:worker_threads';
import { RnjbError, type SerializedRnjbError } from '@rnjb/core';
import { analysisTasks, type AnalysisTasks } from './analysis-tasks.ts';

type Reply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: SerializedRnjbError | { message: string } };

/**
 * One long-lived worker, so the parse cache of `ts-analysis` (keyed by file hash) survives
 * between imports and extractions and the next run is incremental (§5.1).
 */
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: unknown) => void }
>();

function analysisWorker(): Worker {
  if (worker) return worker;
  // Inherits the tsx loader through `execArgv`, like the service itself.
  const created = new Worker(new URL('./analysis.worker.ts', import.meta.url));
  created.unref();
  created.on('message', (reply: Reply) => {
    const waiting = pending.get(reply.id);
    pending.delete(reply.id);
    if (reply.ok) waiting?.resolve(reply.value);
    else if ('code' in reply.error)
      waiting?.reject(new RnjbError(reply.error.code, reply.error.params));
    else waiting?.reject(new Error(reply.error.message));
  });
  created.on('error', (error) => {
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
    worker = undefined;
  });
  worker = created;
  return created;
}

/**
 * Runs an analysis task off the service's main thread, so health checks, the file watcher and
 * other requests keep answering while a repository is analysed (§5.2).
 */
export function offThread<K extends keyof AnalysisTasks>(
  task: K,
  input: Parameters<AnalysisTasks[K]>[0],
): Promise<Awaited<ReturnType<AnalysisTasks[K]>>> {
  // Vitest runs the sources without the tsx loader a worker would need; same code, same thread.
  if (process.env.VITEST) {
    return Promise.resolve(
      (analysisTasks[task] as (value: typeof input) => ReturnType<AnalysisTasks[K]>)(input),
    ) as Promise<Awaited<ReturnType<AnalysisTasks[K]>>>;
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    analysisWorker().postMessage({ id, task, input });
  });
}
