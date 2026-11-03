import type { Patch } from 'immer';
import type { History, RnjbDocument } from '@rnjb/core';
import type { TabSource } from './db.ts';
import type {
  OpenPayload,
  RestorePayload,
  TrackInfo,
  WorkerRequest,
  WorkerResponse,
} from './document.worker.ts';

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type DraftListener = (
  event: { docKey: string; revision: number } | { docKey: string; error: string },
) => void;

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const draftListeners = new Set<DraftListener>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./document.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.op === 'draftSaved') {
        for (const listener of draftListeners)
          listener({ docKey: response.docKey, revision: response.revision });
        return;
      }
      if (response.op === 'draftFailed') {
        for (const listener of draftListeners)
          listener({ docKey: response.docKey, error: response.message });
        return;
      }
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      // Settle in a later task: reading a large document out of the message and rendering it
      // would otherwise be one long task on the main thread (§5.1, 50 ms budget).
      setTimeout(() => {
        if (response.op === 'failed') entry.reject(new Error(response.message));
        else entry.resolve(response.result);
      });
    };
  }
  return worker;
}

function call<T>(request: DistributiveOmit<WorkerRequest, 'id'>): Promise<T> {
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    getWorker().postMessage({ ...request, id });
  });
}

/** Validates a `.rnjb`; with `track`, the worker keeps the document for patches and saving. */
export const openDocumentText = (text: string, track?: TrackInfo) =>
  call<OpenPayload>({ op: 'open', text, ...(track ? { track } : {}) });

/** Serializes a document the worker does not track (e.g. one being created). */
export const serializeDocument = (document: RnjbDocument) =>
  call<string>({ op: 'serialize', document });

export const documentHost = {
  /** The `.rnjb` as UTF-8 bytes (`json`: as a JSON string, for a request body) and its integrity. */
  serialize: (docKey: string, as: 'raw' | 'json') =>
    call<{ bytes: Uint8Array<ArrayBuffer>; integrity: string }>({
      op: 'serializeTracked',
      docKey,
      as,
    }),
  patch: (docKey: string, patches: Patch[], revision: number) =>
    call<boolean>({ op: 'patch', docKey, patches, revision }),
  /** Writes the draft now; with `history`, a snapshot the history can be replayed against. */
  flush: (docKey: string, history?: History) =>
    call<number>({ op: 'flush', docKey, ...(history ? { history } : {}) }),
  /** The `.rnjb` now holds `revision`; `source` changes after «Guardar como». */
  fileSaved: (docKey: string, revision: number, source?: TabSource, integrity?: string) =>
    call<boolean>({
      op: 'fileSaved',
      docKey,
      revision,
      ...(source ? { source } : {}),
      ...(integrity ? { integrity } : {}),
    }),
  restore: (docKey: string, revision: number) =>
    call<RestorePayload>({ op: 'restore', docKey, revision }),
  release: (docKey: string, discard: boolean) => call<boolean>({ op: 'release', docKey, discard }),
  configure: (autosaveDraft: boolean) => call<boolean>({ op: 'config', autosaveDraft }),
  onDraft: (listener: DraftListener) => {
    draftListeners.add(listener);
    return () => draftListeners.delete(listener);
  },
};
