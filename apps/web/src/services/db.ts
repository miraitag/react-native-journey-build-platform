import Dexie, { type EntityTable } from 'dexie';
import type { Patch } from 'immer';
import type {
  DocumentKind,
  History,
  RnjbDocument,
  SerializedRnjbError,
  TrashItem,
} from '@rnjb/core';

/**
 * Browser persistence (plan §18, ADR 0006), shared by the main thread and the document worker.
 * The worker owns the heavy tables (snapshots, patches); the main thread only reads small rows.
 */

export type TabSource =
  { type: 'workspace'; path: string } | { type: 'file'; name: string } | { type: 'memory' };

/** Small metadata row per draft; Home lists the ones with unsaved file changes. */
export interface DraftRow {
  docKey: string;
  name: string;
  slug: string;
  kind: DocumentKind;
  source: TabSource;
  mode: 'edit' | 'recovery';
  issues: SerializedRnjbError[];
  savedAt: string;
  /** The `.rnjb` on disk is behind the draft. */
  fileDirty: boolean;
  /** `integrity` of the `.rnjb` this window last wrote; outlives a page reload. */
  fileIntegrity?: string;
}

export interface SnapshotRow {
  docKey: string;
  document: RnjbDocument;
  /** Present only when it matches `document` exactly (written on unload / hide). */
  history?: History;
}

export interface PatchRow {
  seq?: number;
  docKey: string;
  patches: Patch[];
}

export interface HandleRow {
  docKey: string;
  handle: FileSystemFileHandle;
}

export type TrashRow = TrashItem;

class RnjbDatabase extends Dexie {
  drafts!: EntityTable<DraftRow, 'docKey'>;
  snapshots!: EntityTable<SnapshotRow, 'docKey'>;
  patches!: EntityTable<PatchRow, 'seq'>;
  handles!: EntityTable<HandleRow, 'docKey'>;
  trash!: EntityTable<TrashRow, 'id'>;

  constructor() {
    super('rnjb');
    this.version(1).stores({
      drafts: 'docKey',
      snapshots: 'docKey',
      patches: '++seq, docKey',
      handles: 'docKey',
      trash: 'id, docKey, expiresAt',
    });
  }
}

export const db = new RnjbDatabase();
