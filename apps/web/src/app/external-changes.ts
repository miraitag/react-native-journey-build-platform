import { toast } from 'sonner';
import { create } from 'zustand';
import type { RnjbDocument } from '@rnjb/core';
import { openDocumentText } from '../services/document-client.ts';
import { localService } from '../services/local-service.ts';
import { useService } from '../services/service-store.ts';
import { expectedIntegrity, reloadFromDisk } from './persistence.ts';
import { currentTranslator } from './preferences.ts';
import { isFileDirty, useTabs } from './tabs-store.ts';

/**
 * External changes (§6.5): the local service watches the workspace and this module asks it what
 * changed. A clean tab reloads with a notice; a tab with changes asks what to do.
 */

// shortcut: polls every 2 s instead of a push channel, upgrade if the service gets server-sent events.
const POLL_MS = 2000;

/** A tab whose file changed on disk while it had changes of its own. */
export interface ExternalConflict {
  tabId: string;
  name: string;
  local: RnjbDocument;
  disk: RnjbDocument;
}

export const useExternalChanges = create<{
  conflict: ExternalConflict | undefined;
  dismiss: () => void;
}>((set) => ({ conflict: undefined, dismiss: () => set({ conflict: undefined }) }));

export async function handleExternalChange(path: string): Promise<void> {
  const tab = useTabs.getState().findBySource({ type: 'workspace', path });
  // An unloaded tab reads the file again when it loads.
  if (!tab || tab.status !== 'ready' || !tab.document) return;
  const text = await localService.readFile(path).then(
    (file) => file.contents,
    () => undefined,
  );
  if (text === undefined) return;
  const opened = await openDocumentText(text);
  // Read again after the awaits: a save of this tab may have finished meanwhile.
  const current = useTabs.getState().tabs.find((candidate) => candidate.id === tab.id);
  if (!current?.document || current.fileStatus === 'saving') return;
  // Our own save, or a file that no longer opens (the user is told when they reload it).
  if (!opened.ok || opened.document.integrity === expectedIntegrity(tab.id)) return;

  if (!isFileDirty(current)) {
    await reloadFromDisk(tab.id);
    toast.info(currentTranslator().t('external.reloaded', { name: tab.title }));
    return;
  }
  useExternalChanges.setState({
    conflict: {
      tabId: tab.id,
      name: current.title,
      local: current.document,
      disk: opened.document,
    },
  });
}

/** Polls the service while it is online; returns a function that stops it. */
export function startExternalWatch(): () => void {
  let after = 0;
  let busy = false;
  const poll = async () => {
    if (busy || useService.getState().status !== 'online') return;
    if (!useService.getState().settings?.workspacePath) return;
    busy = true;
    try {
      // Files a tab already holds are skipped by integrity, so replaying old changes is harmless.
      const { seq, paths } = await localService.changes(after);
      if (paths.length > 0) {
        void useService.getState().refreshIndex();
        for (const path of paths) await handleExternalChange(path);
      }
      after = seq;
    } catch {
      // The status bar already shows when the service is unreachable.
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void poll(), POLL_MS);
  void poll();
  return () => clearInterval(timer);
}
