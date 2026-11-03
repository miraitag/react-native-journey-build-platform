/// <reference lib="webworker" />
import { applyPatches, type Patch } from 'immer';
import type { History, RnjbDocument, SerializedRnjbError } from '@rnjb/core';
import { openRnjb, serializeRnjb, serializeRnjbWithIntegrity } from '@rnjb/document-schema';
import { db, type DraftRow, type TabSource } from './db.ts';

/**
 * Document host (§5.2, §18.2). Parsing, validation, hashing, serialization and draft writes run
 * here. The worker keeps its own copy of every open document and follows it with the patches the
 * editor produces, so saving never has to send a whole document across threads.
 */

/** Draft patches are written this long after the last change. */
const DRAFT_DELAY_MS = 800;
/** Patch batches between full snapshots. */
const CONSOLIDATE_EVERY = 40;

export interface TrackInfo {
  docKey: string;
  source: TabSource;
  /** Write a snapshot right away (sources that cannot be re-read: memory, loose files). */
  persist: boolean;
  /** The document is not on disk yet (memory sources). */
  fileDirty: boolean;
}

export type WorkerRequest =
  | { id: number; op: 'open'; text: string; track?: TrackInfo }
  | { id: number; op: 'serialize'; document: RnjbDocument }
  /** `json` encodes the text as a JSON string, ready to embed in a request body. */
  | { id: number; op: 'serializeTracked'; docKey: string; as: 'raw' | 'json' }
  | { id: number; op: 'patch'; docKey: string; patches: Patch[]; revision: number }
  | { id: number; op: 'flush'; docKey: string; history?: History }
  | {
      id: number;
      op: 'fileSaved';
      docKey: string;
      revision: number;
      source?: TabSource;
      integrity?: string;
    }
  | { id: number; op: 'restore'; docKey: string; revision: number }
  | { id: number; op: 'release'; docKey: string; discard: boolean }
  | { id: number; op: 'config'; autosaveDraft: boolean };

export type OpenPayload =
  | { ok: true; mode: 'edit' | 'recovery'; document: RnjbDocument; issues: SerializedRnjbError[] }
  | { ok: false; error: SerializedRnjbError };

export type RestorePayload = {
  document: RnjbDocument;
  history: History | undefined;
  draft: DraftRow;
} | null;

export type WorkerResponse =
  | { id: number; op: 'result'; result: unknown }
  | { id: number; op: 'failed'; message: string }
  | { id: 0; op: 'draftSaved'; docKey: string; revision: number }
  | { id: 0; op: 'draftFailed'; docKey: string; message: string };

interface Entry {
  document: RnjbDocument;
  source: TabSource;
  mode: 'edit' | 'recovery';
  issues: SerializedRnjbError[];
  pending: Patch[];
  revision: number;
  fileDirty: boolean;
  fileIntegrity?: string;
  patchRows: number;
  hasSnapshot: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Serializes writes per document. */
  chain: Promise<void>;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const entries = new Map<string, Entry>();
let autosaveDraft = true;

const post = (message: WorkerResponse) => scope.postMessage(message);

function track(docKey: string, opened: Omit<Entry, 'pending' | 'chain' | 'timer'>): Entry {
  const entry: Entry = { ...opened, pending: [], timer: undefined, chain: Promise.resolve() };
  entries.set(docKey, entry);
  return entry;
}

interface PersistOptions {
  snapshot?: boolean;
  history?: History;
  force?: boolean;
}

/** Writes pending patches (or a full snapshot) and the metadata row in one transaction. */
function persist(docKey: string, entry: Entry, options: PersistOptions = {}): Promise<void> {
  clearTimeout(entry.timer);
  entry.timer = undefined;
  const run = async () => {
    if (!autosaveDraft && !options.force) return;
    // Capture the batch and the document together: patches arriving during the write belong to
    // the next batch, and the snapshot must not already contain them.
    const batch = entry.pending.splice(0);
    const document = entry.document;
    const revision = entry.revision;
    const snapshot =
      options.snapshot === true || !entry.hasSnapshot || entry.patchRows + 1 >= CONSOLIDATE_EVERY;
    if (!snapshot && batch.length === 0) return;
    const { meta } = document;
    const { fileDirty, fileIntegrity } = entry;
    await db.transaction('rw', db.drafts, db.snapshots, db.patches, async () => {
      if (snapshot) {
        await db.snapshots.put({
          docKey,
          document,
          ...(options.history ? { history: options.history } : {}),
        });
        await db.patches.where('docKey').equals(docKey).delete();
      } else {
        await db.patches.add({ docKey, patches: batch });
      }
      await db.drafts.put({
        docKey,
        name: meta.name,
        slug: meta.slug,
        kind: meta.kind,
        source: entry.source,
        mode: entry.mode,
        issues: entry.issues,
        savedAt: new Date().toISOString(),
        fileDirty,
        ...(fileIntegrity ? { fileIntegrity } : {}),
      });
    });
    if (snapshot) {
      entry.patchRows = 0;
      entry.hasSnapshot = true;
    } else {
      entry.patchRows += 1;
    }
    post({ id: 0, op: 'draftSaved', docKey, revision });
  };
  entry.chain = entry.chain.then(run).catch((error: unknown) => {
    post({ id: 0, op: 'draftFailed', docKey, message: String(error) });
  });
  return entry.chain;
}

async function restore(docKey: string, revision: number): Promise<RestorePayload> {
  const [draft, snapshot, rows] = await Promise.all([
    db.drafts.get(docKey),
    db.snapshots.get(docKey),
    db.patches.where('docKey').equals(docKey).sortBy('seq'),
  ]);
  if (!draft || !snapshot) return null;
  let document = snapshot.document;
  for (const row of rows) document = applyPatches(document, row.patches);
  track(docKey, {
    document,
    source: draft.source,
    mode: draft.mode,
    issues: draft.issues,
    revision,
    fileDirty: draft.fileDirty,
    ...(draft.fileIntegrity ? { fileIntegrity: draft.fileIntegrity } : {}),
    patchRows: rows.length,
    hasSnapshot: true,
  });
  // History is only valid against the snapshot it was stored with.
  return { document, history: rows.length === 0 ? snapshot.history : undefined, draft };
}

async function release(docKey: string, discard: boolean): Promise<void> {
  const entry = entries.get(docKey);
  if (entry) {
    clearTimeout(entry.timer);
    await entry.chain;
    // A restore may have re-tracked the document meanwhile; keep that one.
    if (entries.get(docKey) === entry) entries.delete(docKey);
  }
  if (discard) {
    await db.transaction('rw', db.drafts, db.snapshots, db.patches, async () => {
      await db.drafts.delete(docKey);
      await db.snapshots.delete(docKey);
      await db.patches.where('docKey').equals(docKey).delete();
    });
  }
}

function entryOf(docKey: string): Entry {
  const entry = entries.get(docKey);
  if (!entry) throw new Error(`Document ${docKey} is not tracked by the worker`);
  return entry;
}

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.op) {
    case 'open': {
      const opened = await openRnjb(request.text);
      if (!opened.ok) return { ok: false, error: opened.error.toJSON() } satisfies OpenPayload;
      const issues = opened.issues.map((issue) => issue.toJSON());
      if (request.track) {
        const entry = track(request.track.docKey, {
          document: opened.document,
          source: request.track.source,
          mode: opened.mode,
          issues,
          revision: 0,
          fileDirty: request.track.fileDirty,
          patchRows: 0,
          hasSnapshot: false,
        });
        if (request.track.persist) void persist(request.track.docKey, entry, { force: true });
      }
      return {
        ok: true,
        mode: opened.mode,
        document: opened.document,
        issues,
      } satisfies OpenPayload;
    }
    case 'serialize':
      return serializeRnjb(request.document);
    case 'serializeTracked': {
      // Encoded here and transferred: the main thread never copies, encodes or parses a large
      // file while saving (§5.1, no task over 50 ms).
      const { text, integrity } = await serializeRnjbWithIntegrity(
        entryOf(request.docKey).document,
      );
      const bytes = encoder.encode(request.as === 'json' ? JSON.stringify(text) : text);
      return transfer({ bytes, integrity }, [bytes.buffer]);
    }
    case 'patch': {
      const entry = entryOf(request.docKey);
      entry.document = applyPatches(entry.document, request.patches);
      entry.pending.push(...request.patches);
      entry.revision = request.revision;
      entry.fileDirty = true;
      clearTimeout(entry.timer);
      if (autosaveDraft) {
        entry.timer = setTimeout(() => void persist(request.docKey, entry), DRAFT_DELAY_MS);
      }
      return true;
    }
    case 'flush': {
      const entry = entryOf(request.docKey);
      await persist(request.docKey, entry, {
        force: true,
        snapshot: request.history !== undefined,
        ...(request.history ? { history: request.history } : {}),
      });
      return entry.revision;
    }
    case 'fileSaved': {
      const entry = entryOf(request.docKey);
      entry.fileDirty = entry.revision !== request.revision;
      if (request.source) entry.source = request.source;
      if (request.integrity) entry.fileIntegrity = request.integrity;
      const changes = {
        fileDirty: entry.fileDirty,
        ...(request.source ? { source: request.source } : {}),
        ...(request.integrity ? { fileIntegrity: request.integrity } : {}),
      };
      const write = entry.chain.then(async () => {
        await db.drafts.update(request.docKey, changes);
      });
      entry.chain = write.catch(() => undefined);
      await write;
      return true;
    }
    case 'restore':
      return restore(request.docKey, request.revision);
    case 'release':
      await release(request.docKey, request.discard);
      return true;
    case 'config':
      autosaveDraft = request.autosaveDraft;
      return true;
  }
}

const encoder = new TextEncoder();
/** Results whose buffers move to the main thread instead of being copied. */
const transfers = new WeakMap<object, Transferable[]>();
function transfer<T extends object>(result: T, buffers: Transferable[]): T {
  transfers.set(result, buffers);
  return result;
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await handle(request);
    const buffers =
      typeof result === 'object' && result !== null ? transfers.get(result) : undefined;
    if (buffers) scope.postMessage({ id: request.id, op: 'result', result }, buffers);
    else post({ id: request.id, op: 'result', result });
  } catch (error) {
    post({ id: request.id, op: 'failed', message: String(error) });
  }
};
