import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { toast } from 'sonner';
import {
  captureNode,
  captureScreen,
  expiryOf,
  remainingMs,
  removeNode,
  removeScreen,
  restoreNode,
  restoreScreen,
  type DocumentNode,
  type TrashItem,
  type TrashRetentionHours,
  type WorkspaceEntry,
} from '@rnjb/core';
import type { Translator } from '@rnjb/i18n';
import { db, type DraftRow } from '../services/db.ts';
import { localService } from '../services/local-service.ts';
import { useService } from '../services/service-store.ts';
import { closeTab } from './persistence.ts';
import { currentTranslator } from './preferences.ts';
import { reportError } from './report-error.ts';
import { useTabs } from './tabs-store.ts';

/** Trash (§18.4): items expire after 48 h (or 24 h); purged at start and every hour. */

const PURGE_INTERVAL_MS = 3_600_000;

const retention = (): TrashRetentionHours =>
  useService.getState().settings?.trashRetentionHours ?? 48;

/** Node and screen ids are stable, so deleting again after an undo replaces the old row. */
function stamp(id: string = crypto.randomUUID()): {
  id: string;
  deletedAt: string;
  expiresAt: string;
} {
  const deletedAt = new Date().toISOString();
  return { id, deletedAt, expiresAt: expiryOf(deletedAt, retention()) };
}

const nodeName = (node: DocumentNode, codeLabel: string) =>
  node.name ?? (node.kind === 'component' ? node.ref.component : codeLabel);

export async function trashNode(tabId: string, screenId: string, nodeId: string): Promise<void> {
  const i18n = currentTranslator();
  const tabs = useTabs.getState();
  const tab = tabs.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.document) return;
  try {
    const payload = captureNode(tab.document, screenId, nodeId);
    const node = payload.nodes[nodeId] as DocumentNode;
    const label = nodeName(node, i18n.t('editor.layers.code'));
    tabs.apply(tabId, removeNode(screenId, nodeId));
    if (tab.view.selectedNodeId === nodeId) tabs.updateView(tabId, { selectedNodeId: undefined });
    const item: TrashItem = {
      ...stamp(`${tabId}:node:${nodeId}`),
      kind: 'node',
      docKey: tabId,
      label,
      payload,
    };
    await keepInTrash(tabId, item, i18n);
  } catch (error) {
    reportError(error, i18n);
  }
}

/** Keeps what was removed from an open tab; the toast undoes it in place. */
async function keepInTrash(tabId: string, item: TrashItem, i18n: Translator): Promise<void> {
  await db.trash.put(item);
  toast(i18n.t('trash.deleted', { name: item.label }), {
    action: {
      label: i18n.t('editor.topbar.undo'),
      onClick: () => useTabs.getState().undo(tabId),
    },
  });
}

export async function trashScreen(tabId: string, screenId: string): Promise<void> {
  const i18n = currentTranslator();
  const tabs = useTabs.getState();
  const tab = tabs.tabs.find((candidate) => candidate.id === tabId);
  if (!tab?.document) return;
  try {
    const payload = captureScreen(tab.document, screenId);
    tabs.apply(tabId, removeScreen(screenId));
    if (tab.view.selectedScreenId === screenId) {
      const next = useTabs.getState().tabs.find((candidate) => candidate.id === tabId)?.document
        ?.screens[0];
      tabs.updateView(tabId, {
        selectedScreenId: next?.id,
        selectedNodeId: undefined,
        stateId: next?.states[0]?.id,
      });
    }
    const label = payload.screen.name;
    const item: TrashItem = {
      ...stamp(`${tabId}:screen:${screenId}`),
      kind: 'screen',
      docKey: tabId,
      label,
      payload,
    };
    await keepInTrash(tabId, item, i18n);
  } catch (error) {
    reportError(error, i18n);
  }
}

/** Moves a journey or template file to the trash; an open tab is saved and closed first. */
export async function trashEntry(entry: WorkspaceEntry): Promise<void> {
  const i18n = currentTranslator();
  try {
    const open = useTabs.getState().findBySource({ type: 'workspace', path: entry.path });
    if (open) await closeTab(open.id);
    const { path, contents } = await localService.deleteFile(entry.path);
    const item: TrashItem = {
      ...stamp(),
      kind: entry.kind,
      label: entry.name,
      payload: { path, contents },
    };
    await db.trash.put(item);
    void useService.getState().refreshIndex();
    toast(i18n.t('trash.deleted', { name: entry.name }), {
      action: { label: i18n.t('trash.restore'), onClick: () => void restoreItem(item) },
    });
  } catch (error) {
    reportError(error, i18n);
  }
}

export async function restoreItem(item: TrashItem): Promise<void> {
  const i18n = currentTranslator();
  try {
    if (item.kind === 'node' || item.kind === 'screen') {
      const command =
        item.kind === 'node' ? restoreNode(item.payload) : restoreScreen(item.payload);
      useTabs.getState().apply(item.docKey, command);
    } else {
      await localService.writeFile(item.payload.path, item.payload.contents, { createOnly: true });
      void useService.getState().refreshIndex();
    }
    await db.trash.delete(item.id);
    toast.success(i18n.t('trash.restored', { name: item.label }));
  } catch (error) {
    reportError(error, i18n);
  }
}

export const deleteForever = (ids: string[]) => db.trash.bulkDelete(ids);

export async function purgeTrash(): Promise<void> {
  await db.trash.where('expiresAt').belowOrEqual(new Date().toISOString()).delete();
}

export function startTrashPurge(): () => void {
  void purgeTrash();
  const timer = setInterval(() => void purgeTrash(), PURGE_INTERVAL_MS);
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Live views
// ---------------------------------------------------------------------------

function useLive<T>(query: () => Promise<T>, initial: T, key: string): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({ next: setValue });
    return () => subscription.unsubscribe();
    // `key` identifies the query; the closure is recreated on every render.
  }, [key]);
  return value;
}

const NO_ITEMS: TrashItem[] = [];
const NO_DRAFTS: DraftRow[] = [];

const newestFirst = (a: TrashItem, b: TrashItem) => b.deletedAt.localeCompare(a.deletedAt);

/** Nodes and screens deleted from one document. */
export const useDocumentTrash = (docKey: string): TrashItem[] =>
  useLive(
    async () => (await db.trash.where('docKey').equals(docKey).toArray()).sort(newestFirst),
    NO_ITEMS,
    `doc:${docKey}`,
  );

/** Deleted journeys and templates. */
export const useFileTrash = (): TrashItem[] =>
  useLive(
    async () =>
      (
        await db.trash
          .filter((item) => item.kind === 'journey' || item.kind === 'template')
          .toArray()
      ).sort(newestFirst),
    NO_ITEMS,
    'files',
  );

/** Drafts whose file is behind (tabs closed with unsaved changes). */
export const useDirtyDrafts = (): DraftRow[] =>
  useLive(
    async () =>
      (await db.drafts.filter((draft) => draft.fileDirty).toArray()).sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt),
      ),
    NO_DRAFTS,
    'drafts',
  );

export function remainingLabel(item: TrashItem, now: number, i18n: Translator): string {
  const minutes = Math.max(1, Math.round(remainingMs(item, now) / 60_000));
  return minutes < 60
    ? i18n.t('trash.remainingMinutes', { count: minutes })
    : i18n.t('trash.remainingHours', { count: Math.round(minutes / 60) });
}

/** Re-renders every `intervalMs` so remaining times stay current. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
