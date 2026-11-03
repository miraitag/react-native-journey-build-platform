import { Suspense, lazy, useEffect, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { Toaster, TooltipProvider } from '@rnjb/ui';
import { useService } from '../services/service-store.ts';
import { onFocusRequest } from '../services/doc-locks.ts';
import { Home } from '../home/Home.tsx';
import { CreateJourneyDialog } from '../home/CreateJourneyDialog.tsx';
import { RemoteCompareDialog } from '../home/RemoteCompareDialog.tsx';
import { ExportDialog } from '../editor/ExportDialog.tsx';
import { CustomDevicesDialog } from '../editor/CustomDevicesDialog.tsx';
import { ImportDialog } from '../editor/ImportDialog.tsx';
import { Editor } from '../editor/Editor.tsx';
import { unresolvedLibraryCount } from '../editor/problems.ts';
import { usePreferenceEffects, usePreferences, useT } from './preferences.ts';
import { HOME_TAB, selectActiveTab, sourceKey, useTabs } from './tabs-store.ts';
import { useGlobalShortcuts } from './use-global-shortcuts.ts';
import { openText, reportError } from './open-document.ts';
import { startPersistence } from './persistence.ts';
import { startExternalWatch } from './external-changes.ts';
import { ExternalChangeDialog } from './ExternalChangeDialog.tsx';
import { TeamImportDialog } from './TeamImportDialog.tsx';
import { startTrashPurge } from './trash.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { TabBar } from './TabBar.tsx';
import { StatusBar } from './StatusBar.tsx';
import { useDialogs } from './dialogs-store.ts';
import { SettingsDialog } from './SettingsDialog.tsx';
import { ShortcutsDialog } from './ShortcutsDialog.tsx';
import { TrashDialog } from '../home/TrashDialog.tsx';

// Opened only with Cmd/Ctrl+K; `cmdk` stays out of the initial bundle (§5.1).
const CommandPalette = lazy(() =>
  import('./CommandPalette.tsx').then((module) => ({ default: module.CommandPalette })),
);

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

interface LaunchQueueWindow {
  launchQueue?: {
    setConsumer: (consumer: (params: { files: readonly FileSystemFileHandle[] }) => void) => void;
  };
}

type HandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

export function App() {
  usePreferenceEffects();
  useGlobalShortcuts();
  const i18n = useT();
  const resolvedTheme = usePreferences((state) => state.resolvedTheme);
  const connect = useService((state) => state.connect);
  const settings = useService((state) => state.settings);
  const activeId = useTabs((state) => state.activeId);
  const activeTab = useTabs(selectActiveTab);
  const paletteOpen = useDialogs((state) => state.open === 'palette');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    startPersistence();
    const stopWatch = startExternalWatch();
    const stopPurge = startTrashPurge();
    return () => {
      stopWatch();
      stopPurge();
    };
  }, []);

  // Another window asked for a journey this window holds: show its tab.
  useEffect(
    () =>
      onFocusRequest((key) => {
        const tab = useTabs
          .getState()
          .tabs.find((candidate) => sourceKey(candidate.source) === key);
        if (tab) useTabs.getState().activate(tab.id);
      }),
    [],
  );

  // Installed as a PWA, the OS hands `.rnjb` files to the platform (§18.5).
  useEffect(() => {
    (window as unknown as LaunchQueueWindow).launchQueue?.setConsumer(({ files }) => {
      for (const handle of files) {
        void handle
          .getFile()
          .then((file) =>
            file
              .text()
              .then((text) =>
                openText(text, { type: 'file', name: file.name }, file.name, i18n, handle),
              ),
          )
          .catch((error: unknown) => reportError(error, i18n));
      }
    });
  }, [i18n]);

  // Reconnect and re-index on focus: files may have changed outside the platform.
  useEffect(() => {
    const run = () => void connect().catch((error: unknown) => reportError(error, i18n));
    run();
    window.addEventListener('focus', run);
    return () => window.removeEventListener('focus', run);
  }, [connect, i18n]);

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    // Handles must be requested synchronously, inside the drop event.
    const items = [...event.dataTransfer.items]
      .filter((item) => item.kind === 'file')
      .map((item) => ({
        file: item.getAsFile(),
        handle: (item as HandleItem).getAsFileSystemHandle?.(),
      }));
    for (const { file, handle } of items) {
      if (!file?.name.endsWith('.rnjb')) continue;
      const resolved = await handle?.catch(() => null);
      await openText(
        await file.text(),
        { type: 'file', name: file.name },
        file.name,
        i18n,
        resolved?.kind === 'file' ? (resolved as FileSystemFileHandle) : undefined,
      );
    }
  };

  const resolved = new Set(Object.keys(settings?.librarySources ?? {}));

  return (
    <TooltipProvider>
      <div
        className="relative flex h-full flex-col"
        onDragOver={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget === event.target ||
            !event.currentTarget.contains(event.relatedTarget as Node)
          )
            setDragging(false);
        }}
        onDrop={(event) => void onDrop(event)}
      >
        <TabBar />
        <div className="min-h-0 flex-1">
          <ErrorBoundary
            key={activeId}
            area={activeTab ? activeTab.title : i18n.t('tabs.home')}
            i18n={i18n}
            className="h-full bg-canvas p-6"
          >
            {activeId === HOME_TAB || !activeTab ? (
              <Home />
            ) : (
              <Editor key={activeTab.id} tab={activeTab} />
            )}
          </ErrorBoundary>
        </div>
        <StatusBar
          unresolvedLibraries={
            activeTab?.document ? unresolvedLibraryCount(activeTab.document, resolved) : 0
          }
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent-subtle/80">
            <span className="flex items-center gap-2 rounded-md bg-panel px-3 py-2 text-sm font-medium text-accent-fg shadow-popover">
              <FileUp size={16} aria-hidden />
              {i18n.t('home.actions.openFile')}
            </span>
          </div>
        )}
      </div>
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      <SettingsDialog />
      <CreateJourneyDialog />
      <ShortcutsDialog />
      <TrashDialog />
      <RemoteCompareDialog />
      <ExternalChangeDialog />
      <ExportDialog />
      <CustomDevicesDialog />
      <ImportDialog />
      <TeamImportDialog />
      <Toaster theme={resolvedTheme} />
    </TooltipProvider>
  );
}
