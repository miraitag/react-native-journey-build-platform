import { toast } from 'sonner';
import type { RnjbDocument, SerializedRnjbError, WorkspaceEntry } from '@rnjb/core';
import type { Translator } from '@rnjb/i18n';
import { db } from '../services/db.ts';
import { openDocumentText, serializeDocument } from '../services/document-client.ts';
import { acquireLock, releaseLock, requestFocusElsewhere } from '../services/doc-locks.ts';
import { localService } from '../services/local-service.ts';
import { useService } from '../services/service-store.ts';
import { pickRnjbFile } from '../services/file-picker.ts';
import { enforceLoadedLimit } from './persistence.ts';
import { reportError } from './report-error.ts';
import { baseOf } from './remote-base.ts';
import { sourceKey, useTabs, type TabSource } from './tabs-store.ts';

export { reportError };

function openFailed(error: SerializedRnjbError, i18n: Translator): void {
  const { message, action } = i18n.error(error.code, error.params);
  toast.error(i18n.t('open.failed'), { description: `${message} ${action}`, duration: Infinity });
}

/** Validates a `.rnjb` text without opening a tab; reports why when it cannot be read. */
export async function readDocument(
  text: string,
  i18n: Translator,
): Promise<RnjbDocument | undefined> {
  const opened = await openDocumentText(text);
  if (opened.ok) return opened.document;
  openFailed(opened.error, i18n);
  return undefined;
}

/** Validates in the worker and opens (or focuses) a document tab. */
export async function openText(
  text: string,
  source: TabSource,
  label: string,
  i18n: Translator,
  handle?: FileSystemFileHandle,
): Promise<void> {
  const tabs = useTabs.getState();
  const existing = tabs.findBySource(source);
  if (existing) {
    tabs.activate(existing.id);
    toast.info(i18n.t('open.alreadyOpen', { name: existing.title }));
    return;
  }
  const id = crypto.randomUUID();
  const key = sourceKey(source);
  if (key && !(await acquireLock(id, key))) {
    requestFocusElsewhere(key);
    toast.info(i18n.t('open.otherWindow', { name: label }));
    return;
  }
  const onDisk = source.type !== 'memory';
  const result = await openDocumentText(text, {
    docKey: id,
    source,
    // Workspace files can be read again; anything else needs its own copy right away.
    persist: source.type !== 'workspace',
    fileDirty: !onDisk,
  });
  if (!result.ok) {
    releaseLock(id);
    openFailed(result.error, i18n);
    return;
  }
  if (handle) await db.handles.put({ docKey: id, handle });
  useTabs.getState().open({
    id,
    source,
    document: result.document,
    mode: result.mode,
    issues: result.issues,
    onDisk,
  });
  void enforceLoadedLimit();
}

export async function openWorkspaceEntry(path: string, i18n: Translator): Promise<void> {
  const existing = useTabs.getState().findBySource({ type: 'workspace', path });
  if (existing) {
    useTabs.getState().activate(existing.id);
    return;
  }
  try {
    const { contents } = await localService.readFile(path);
    await openText(contents, { type: 'workspace', path }, path, i18n);
  } catch (error) {
    reportError(error, i18n);
  }
}

/**
 * Opens an item of a remote source (§6.4): the first time it is copied into the workspace, linked
 * to its origin by `provenance.remote`; afterwards the copy is opened. Nothing is ever pushed.
 */
export async function openRemoteEntry(
  sourceId: string,
  entry: WorkspaceEntry,
  i18n: Translator,
): Promise<void> {
  const origin = entry.remote;
  if (!origin) return;
  const copy = useService
    .getState()
    .index?.entries.find(
      (candidate) =>
        candidate.remote?.remote === origin.remote && candidate.remote.path === origin.path,
    );
  if (copy) return openWorkspaceEntry(copy.path, i18n);
  try {
    const { contents } = await localService.readRemoteFile(sourceId, entry.path);
    const opened = await readDocument(contents, i18n);
    if (!opened) return;
    const document = {
      ...opened,
      provenance: { remote: { ...origin, base: await baseOf(opened) } },
    };
    const { slug, kind, name } = document.meta;
    const path = `${kind === 'template' ? 'templates' : 'journeys'}/${slug}/${slug}.rnjb`;
    const text = await serializeDocument(document);
    await localService.writeFile(path, text, { createOnly: true });
    await openText(text, { type: 'workspace', path }, name, i18n);
    void useService.getState().refreshIndex();
    toast.success(i18n.t('home.remote.opened', { name }));
  } catch (error) {
    reportError(error, i18n);
  }
}

export async function openFromDisk(i18n: Translator): Promise<void> {
  try {
    const picked = await pickRnjbFile();
    if (picked) {
      await openText(
        picked.text,
        { type: 'file', name: picked.name },
        picked.name,
        i18n,
        picked.handle,
      );
    }
  } catch (error) {
    reportError(error, i18n);
  }
}

/** Opens a file of a folder picked without the local service (§6.7), like a standalone file. */
export async function openFromHandle(
  handle: FileSystemFileHandle,
  i18n: Translator,
): Promise<void> {
  try {
    const file = await handle.getFile();
    await openText(await file.text(), { type: 'file', name: file.name }, file.name, i18n, handle);
  } catch (error) {
    reportError(error, i18n);
  }
}
