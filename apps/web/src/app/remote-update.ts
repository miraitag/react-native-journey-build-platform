import { toast } from 'sonner';
import type { RnjbDocument, WorkspaceEntry } from '@rnjb/core';
import type { Translator } from '@rnjb/i18n';
import { serializeDocument } from '../services/document-client.ts';
import { localService } from '../services/local-service.ts';
import { originOf, sourceIdOf, useRemotes } from '../services/remote-store.ts';
import { useService } from '../services/service-store.ts';
import { closeTab } from './persistence.ts';
import { baseOf } from './remote-base.ts';
import { reportError } from './report-error.ts';
import { isFileDirty, useTabs } from './tabs-store.ts';
import { openWorkspaceEntry, readDocument } from './open-document.ts';

/** A local copy and the item of the remote source it came from, both read and validated. */
export interface UpdatePair {
  copy: WorkspaceEntry;
  sourceId: string;
  local: RnjbDocument;
  remote: RnjbDocument;
  remoteEntry: WorkspaceEntry;
  /** The copy differs from what was copied, or its origin is unknown. */
  localChanges: boolean;
}

/** Unsaved edits in an open tab count as local changes, as does anything that moved the base hash. */
export async function hasLocalChanges(path: string, local: RnjbDocument): Promise<boolean> {
  const tab = useTabs.getState().findBySource({ type: 'workspace', path });
  if (tab && isFileDirty(tab)) return true;
  const base = local.provenance?.remote?.base;
  return base === undefined || base !== (await baseOf(local));
}

export async function loadUpdatePair(
  copy: WorkspaceEntry,
  i18n: Translator,
): Promise<UpdatePair | undefined> {
  const results = useRemotes.getState().results;
  const sourceId = sourceIdOf(results, copy);
  const remoteEntry = originOf(results, copy);
  if (!sourceId || !remoteEntry) {
    toast.error(i18n.t('home.remote.noOrigin'));
    return undefined;
  }
  const [localFile, remoteFile] = await Promise.all([
    localService.readFile(copy.path),
    localService.readRemoteFile(sourceId, remoteEntry.path),
  ]);
  const [local, remote] = await Promise.all([
    readDocument(localFile.contents, i18n),
    readDocument(remoteFile.contents, i18n),
  ]);
  if (!local || !remote) return undefined;
  return {
    copy,
    sourceId,
    local,
    remote,
    remoteEntry,
    localChanges: await hasLocalChanges(copy.path, local),
  };
}

/**
 * Replaces the copy by its origin (§6.4). Refused when the copy has local changes; the file keeps
 * its place in the workspace and records the new commit and base.
 */
export async function replaceFromOrigin(copy: WorkspaceEntry, i18n: Translator): Promise<boolean> {
  try {
    const pair = await loadUpdatePair(copy, i18n);
    if (!pair) return false;
    if (pair.localChanges) {
      toast.error(i18n.t('home.remote.replaceBlocked'));
      return false;
    }
    const origin = pair.remoteEntry.remote;
    if (!origin) return false;
    const { provenance: _provenance, ...content } = pair.remote;
    const document: RnjbDocument = {
      ...content,
      provenance: { remote: { ...origin, base: await baseOf(pair.remote) } },
    };
    const text = await serializeDocument(document);
    const open = useTabs.getState().findBySource({ type: 'workspace', path: copy.path });
    if (open) await closeTab(open.id);
    await localService.writeFile(copy.path, text);
    void useService.getState().refreshIndex();
    if (open) await openWorkspaceEntry(copy.path, i18n);
    toast.success(i18n.t('home.remote.replaced', { name: document.meta.name }));
    return true;
  } catch (error) {
    reportError(error, i18n);
    return false;
  }
}
