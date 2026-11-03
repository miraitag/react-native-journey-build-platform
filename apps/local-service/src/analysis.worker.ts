import { parentPort } from 'node:worker_threads';
import { isRnjbError } from '@rnjb/core';
import { analysisTasks, type AnalysisTasks } from './analysis-tasks.ts';

interface Request {
  id: number;
  task: keyof AnalysisTasks;
  input: never;
}

parentPort?.on('message', ({ id, task, input }: Request) => {
  Promise.resolve()
    .then((): unknown => analysisTasks[task](input))
    .then(
      (value) => parentPort?.postMessage({ id, ok: true, value }),
      (error: unknown) =>
        parentPort?.postMessage({
          id,
          ok: false,
          error: isRnjbError(error) ? error.toJSON() : { message: String(error) },
        }),
    );
});
