import { toast } from 'sonner';
import { RnjbError, emptyHistory } from '@rnjb/core';
import { db, type TabSource } from '../services/db.ts';
import { documentHost, openDocumentText } from '../services/document-client.ts';
import { acquireLock, releaseLock } from '../services/doc-locks.ts';
import { ServiceError, localService } from '../services/local-service.ts';
import { useService } from '../services/service-store.ts';
import { currentTranslator, usePreferences } from './preferences.ts';
import { reportError, toSerialized } from './report-error.ts';
import {
  HOME_TAB,
  initialView,
  isDraftPending,
  isFileDirty,
  sourceKey,
  useTabs,
  type DocumentTab,
  type ViewState,
} from './tabs-store.ts';

/**
 * Two-level saving (§18.2): the draft (IndexedDB, written by the worker ~800 ms after a change)
 * and the `.rnjb` file (5 s after the last change, on close, on Cmd/Ctrl+S and when the window
 * is hidden). Also tab unloading beyond 8 tabs and session restore (§18.3).
 */

const MAX_LOADED_TABS = 8;
const FILE_DELAY_MS = 5000;
const SESSION_KEY = 'rnjb.session';

const tabOf = (id: string): DocumentTab | undefined =>
  useTabs.getState().tabs.find((tab) => tab.id === id);
const patchTab = (id: string, patch: Partial<DocumentTab>) =>
  useTabs.getState().patchTab(id, patch);

/**
 * `integrity` of each workspace file as this window last wrote it. Before the first save the
 * document's own `integrity` (as read) is used; the service refuses to overwrite a newer file.
 */
const diskIntegrity = new Map<string, string>();
// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

type PermissionedHandle = FileSystemFileHandle & {
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

async function writeHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array<ArrayBuffer>,
  interactive: boolean,
) {
  const target = handle as PermissionedHandle;
  const options = { mode: 'readwrite' } as const;
  let permission = (await target.queryPermission?.(options)) ?? 'granted';
  // Asking needs a user gesture, so only explicit saves prompt.
  if (permission !== 'granted' && interactive && target.requestPermission) {
    permission = await target.requestPermission(options);
  }
  if (permission !== 'granted') throw new RnjbError('RNJB-207', { file: handle.name });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function markSaved(id: string, revision: number, source?: TabSource): Promise<void> {
  patchTab(id, {
    fileRevision: revision,
    fileStatus: 'idle',
    fileError: undefined,
    ...(source ? { source } : {}),
  });
  await documentHost.fileSaved(id, revision, source, diskIntegrity.get(id));
  const tab = tabOf(id);
  if (tab && tab.revision !== revision) scheduleFileSave(id);
  if (tab?.source.type === 'workspace') void useService.getState().refreshIndex();
}

export type SaveOutcome = 'saved' | 'pending' | 'failed';

export async function saveFile(
  id: string,
  { interactive = false }: { interactive?: boolean } = {},
): Promise<SaveOutcome> {
  const tab = tabOf(id);
  if (!tab || tab.status !== 'ready' || tab.mode === 'recovery') return 'pending';
  if (!isFileDirty(tab)) return 'saved';
  if (tab.fileStatus === 'saving') return 'pending';
  const { source } = tab;
  if (source.type === 'memory') return interactive ? saveAs(id) : 'pending';
  const handle = source.type === 'file' ? (await db.handles.get(id))?.handle : undefined;
  if (source.type === 'file' && !handle) return interactive ? saveAs(id) : 'pending';
  if (source.type === 'workspace' && useService.getState().status !== 'online') {
    if (interactive) reportError(new ServiceError('RNJB-401'));
    return 'pending';
  }
  clearTimeout(timers.get(id));
  const revision = tab.revision;
  patchTab(id, { fileStatus: 'saving' });
  try {
    const { bytes, integrity } = await documentHost.serialize(
      id,
      source.type === 'workspace' ? 'json' : 'raw',
    );
    if (source.type === 'workspace') {
      const expected = diskIntegrity.get(id) ?? tab.document?.integrity;
      await localService.writeFile(
        source.path,
        bytes,
        expected ? { expectedIntegrity: expected } : {},
      );
      diskIntegrity.set(id, integrity);
    } else if (handle) await writeHandle(handle, bytes, interactive);
    await markSaved(id, revision);
    return 'saved';
  } catch (error) {
    patchTab(id, {
      fileStatus: 'error',
      fileError: toSerialized(error, new RnjbError('RNJB-207', { file: tab.title })),
    });
    if (interactive) reportError(error);
    // The file changed on disk under us: ask what to do instead of leaving a save that keeps failing.
    if (source.type === 'workspace' && error instanceof ServiceError && error.code === 'RNJB-208')
      void import('./external-changes.ts').then(({ handleExternalChange }) =>
        handleExternalChange(source.path),
      );
    return 'failed';
  }
}

/** «Guardar como»: into the workspace when there is one, else a file picker, else a download. */
export async function saveAs(id: string): Promise<SaveOutcome> {
  const tab = tabOf(id);
  if (!tab?.document || tab.status !== 'ready' || tab.mode === 'recovery') return 'pending';
  const i18n = currentTranslator();
  const { status, settings } = useService.getState();
  const { slug } = tab.document.meta;
  const revision = tab.revision;
  try {
    const toWorkspace = status === 'online' && Boolean(settings?.workspacePath);
    const { bytes, integrity } = await documentHost.serialize(id, toWorkspace ? 'json' : 'raw');
    if (toWorkspace) {
      const folder = tab.kind === 'template' ? 'templates' : 'journeys';
      const path = `${folder}/${slug}/${slug}.rnjb`;
      const source: TabSource = { type: 'workspace', path };
      const key = sourceKey(source) as string;
      if (useTabs.getState().findBySource(source) || !(await acquireLock(id, key))) {
        throw new RnjbError('RNJB-002', { slug });
      }
      try {
        await localService.writeFile(path, bytes, { createOnly: true });
        diskIntegrity.set(id, integrity);
      } catch (error) {
        releaseLock(id);
        throw error;
      }
      await markSaved(id, revision, source);
      toast.success(i18n.t('save.savedTo', { path }));
      return 'saved';
    }
    const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
      let handle: FileSystemFileHandle;
      try {
        handle = await picker({
          suggestedName: `${slug}.rnjb`,
          types: [{ description: 'RN Journey Builder', accept: { 'application/json': ['.rnjb'] } }],
        });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return 'pending';
        throw error;
      }
      await writeHandle(handle, bytes, true);
      await db.handles.put({ docKey: id, handle });
      await markSaved(id, revision, { type: 'file', name: handle.name });
      return 'saved';
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${slug}.rnjb`,
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.info(i18n.t('save.downloaded'));
    return 'pending';
  } catch (error) {
    reportError(error, i18n);
    return 'failed';
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleFileSave(id: string): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!usePreferences.getState().autosaveFile) return;
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void saveFile(id);
    }, FILE_DELAY_MS),
  );
}

// ---------------------------------------------------------------------------
// Tabs: close, load, unload
// ---------------------------------------------------------------------------

export async function closeTab(id: string): Promise<void> {
  const tab = tabOf(id);
  if (!tab) return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  let saved = !isFileDirty(tab);
  if (!saved && tab.status === 'ready' && usePreferences.getState().autosaveFile) {
    saved = (await saveFile(id)) === 'saved';
  }
  try {
    // The draft must hold everything before the worker forgets the document.
    if (!saved && tab.status === 'ready') await documentHost.flush(id);
    await documentHost.release(id, saved);
    if (saved) await db.handles.delete(id);
  } catch (error) {
    reportError(error);
  }
  releaseLock(id);
  diskIntegrity.delete(id);
  useTabs.getState().remove(id);
  if (!saved) toast.info(currentTranslator().t('save.draftKept', { name: tab.title }));
}

export async function loadTab(id: string): Promise<void> {
  const tab = tabOf(id);
  if (!tab || tab.status === 'ready' || tab.status === 'loading') return;
  patchTab(id, { status: 'loading', fileError: undefined });
  try {
    const restored = await documentHost.restore(id, tab.revision);
    const fresh = !restored?.history && tab.source.type === 'workspace' && !isFileDirty(tab);
    if (restored && !fresh) {
      if (restored.draft.fileIntegrity) diskIntegrity.set(id, restored.draft.fileIntegrity);
      patchTab(id, {
        status: 'ready',
        document: restored.document,
        history: restored.history ?? emptyHistory(),
        mode: restored.draft.mode,
        issues: restored.draft.issues,
        title: restored.document.meta.name,
        draftRevision: tab.revision,
        view: tab.view.selectedScreenId ? tab.view : initialView(restored.document),
      });
    } else {
      // Nothing newer than the file: read it again (it may have changed on disk).
      diskIntegrity.delete(id);
      const text = await readSource(id, tab.source);
      const opened = await openDocumentText(text, {
        docKey: id,
        source: tab.source,
        persist: tab.source.type !== 'workspace',
        fileDirty: false,
      });
      if (!opened.ok) throw new RnjbError(opened.error.code, opened.error.params);
      patchTab(id, {
        status: 'ready',
        document: opened.document,
        history: emptyHistory(),
        mode: opened.mode,
        issues: opened.issues,
        title: opened.document.meta.name,
        revision: 0,
        draftRevision: 0,
        fileRevision: 0,
        view: tab.view.selectedScreenId ? tab.view : initialView(opened.document),
      });
    }
    await enforceLoadedLimit();
  } catch (error) {
    patchTab(id, { status: 'failed', fileError: toSerialized(error) });
  }
}

/** `integrity` this tab expects on disk: what it last wrote, or what it read. */
export const expectedIntegrity = (id: string): string | undefined =>
  diskIntegrity.get(id) ?? tabOf(id)?.document?.integrity;

/** «Conservar los míos»: the next save overwrites the version that changed on disk (§6.5). */
export function keepMine(id: string, integrity: string): void {
  diskIntegrity.set(id, integrity);
  scheduleFileSave(id);
}

/** «Recargar»: drops the draft and opens the file as it is on disk now (§6.5). */
export async function reloadFromDisk(id: string): Promise<void> {
  clearTimeout(timers.get(id));
  timers.delete(id);
  await documentHost.release(id, true);
  diskIntegrity.delete(id);
  patchTab(id, {
    status: 'unloaded',
    document: undefined,
    history: emptyHistory(),
    revision: 0,
    fileRevision: 0,
  });
  await loadTab(id);
}

async function readSource(id: string, source: TabSource): Promise<string> {
  if (source.type === 'workspace') return (await localService.readFile(source.path)).contents;
  const handle = source.type === 'file' ? (await db.handles.get(id))?.handle : undefined;
  if (!handle) throw new RnjbError('RNJB-404', { path: source.type === 'file' ? source.name : '' });
  return (await handle.getFile()).text();
}

async function unloadTab(id: string): Promise<void> {
  const tab = tabOf(id);
  if (!tab || tab.status !== 'ready') return;
  if (isFileDirty(tab) && usePreferences.getState().autosaveFile) await saveFile(id);
  const current = tabOf(id);
  if (!current || current.status !== 'ready') return;
  await documentHost.flush(id, current.history);
  const latest = tabOf(id);
  // Edited or activated while flushing: keep it loaded.
  if (!latest || latest.revision !== current.revision || useTabs.getState().activeId === id) return;
  patchTab(id, {
    status: 'unloaded',
    document: undefined,
    history: emptyHistory(),
    draftRevision: latest.revision,
  });
  await documentHost.release(id, false);
}

async function unloadExcess(): Promise<void> {
  const { tabs, activeId } = useTabs.getState();
  const loaded = tabs.filter((tab) => tab.status === 'ready');
  const excess = loaded.length - MAX_LOADED_TABS;
  if (excess <= 0) return;
  const victims = loaded
    .filter((tab) => tab.id !== activeId)
    .sort((a, b) => a.lastActive - b.lastActive)
    .slice(0, excess);
  for (const tab of victims) await unloadTab(tab.id);
}

let enforcing: Promise<void> = Promise.resolve();

/**
 * Keeps at most 8 documents in memory; the least recently used go to the draft. Runs are
 * chained so each one sees the tabs left by the previous.
 */
export function enforceLoadedLimit(): Promise<void> {
  enforcing = enforcing.then(unloadExcess).catch((error: unknown) => reportError(error));
  return enforcing;
}

/** Writes every pending draft (with its history) and file; used when the window is hidden. */
async function flushAll(): Promise<void> {
  const autosaveFile = usePreferences.getState().autosaveFile;
  await Promise.all(
    useTabs
      .getState()
      .tabs.filter((tab) => tab.status === 'ready')
      .map(async (tab) => {
        if (tab.revision > 0) await documentHost.flush(tab.id, tab.history).catch(() => undefined);
        if (autosaveFile && isFileDirty(tab)) await saveFile(tab.id);
      }),
  );
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface SessionTab {
  id: string;
  source: TabSource;
  title: string;
  kind: DocumentTab['kind'];
  view: ViewState;
}

interface Session {
  tabs: SessionTab[];
  activeId: string;
}

function writeSession(): void {
  const { tabs, activeId } = useTabs.getState();
  const session: Session = {
    tabs: tabs.map(({ id, source, title, kind, view }) => ({ id, source, title, kind, view })),
    activeId,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readSession(): Session | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return value && Array.isArray(value.tabs) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Reopens the tabs of the last session as unloaded tabs and loads the active one. */
async function restoreSession(): Promise<void> {
  const session = readSession();
  if (!session) return;
  for (const saved of session.tabs) {
    const draft = await db.drafts.get(saved.id);
    if (!draft && saved.source.type !== 'workspace') continue;
    const key = sourceKey(saved.source);
    if (key && !(await acquireLock(saved.id, key))) continue;
    useTabs.getState().addUnloaded({
      id: saved.id,
      source: draft?.source ?? saved.source,
      title: draft?.name ?? saved.title,
      kind: draft?.kind ?? saved.kind,
      view: saved.view,
      fileDirty: draft?.fileDirty ?? false,
    });
  }
  const active = tabOf(session.activeId);
  if (active) useTabs.getState().activate(active.id);
}

/** Continues a draft listed in Home (its tab was closed with unsaved file changes). */
export async function openDraft(docKey: string): Promise<void> {
  const existing = tabOf(docKey);
  if (existing) return useTabs.getState().activate(docKey);
  const draft = await db.drafts.get(docKey);
  if (!draft) return;
  const key = sourceKey(draft.source);
  if (key && (useTabs.getState().findBySource(draft.source) || !(await acquireLock(docKey, key)))) {
    toast.info(currentTranslator().t('open.otherWindow', { name: draft.name }));
    return;
  }
  useTabs.getState().addUnloaded({
    id: docKey,
    source: draft.source,
    title: draft.name,
    kind: draft.kind,
    view: {
      selectedScreenId: undefined,
      selectedNodeId: undefined,
      stateId: undefined,
      previewTheme: 'light',
      leftPanel: 'screens',
      problemsOpen: false,
    },
    fileDirty: draft.fileDirty,
  });
  useTabs.getState().activate(docKey);
}

export const discardDraft = (docKey: string) => documentHost.release(docKey, true);

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let started = false;

export function startPersistence(): void {
  if (started) return;
  started = true;

  void documentHost.configure(usePreferences.getState().autosaveDraft);
  usePreferences.subscribe((state, previous) => {
    if (state.autosaveDraft !== previous.autosaveDraft)
      void documentHost.configure(state.autosaveDraft);
  });

  let warnedDraft = false;
  documentHost.onDraft((event) => {
    if ('error' in event) {
      if (!warnedDraft) toast.error(currentTranslator().t('save.draftFailed'));
      warnedDraft = true;
      return;
    }
    const tab = tabOf(event.docKey);
    if (tab && event.revision > tab.draftRevision)
      patchTab(event.docKey, { draftRevision: event.revision });
  });

  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  useTabs.subscribe((state, previous) => {
    for (const tab of state.tabs) {
      const before = previous.tabs.find((candidate) => candidate.id === tab.id);
      if (before && before.revision !== tab.revision) scheduleFileSave(tab.id);
    }
    if (state.activeId !== previous.activeId && state.activeId !== HOME_TAB) {
      void loadTab(state.activeId);
    }
    if (state.tabs !== previous.tabs || state.activeId !== previous.activeId) {
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(writeSession, 300);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAll();
  });
  window.addEventListener('beforeunload', (event) => {
    writeSession();
    // Ask before leaving only when some change is not even in the draft yet.
    if (useTabs.getState().tabs.some(isDraftPending)) event.preventDefault();
  });

  void restoreSession();
}
