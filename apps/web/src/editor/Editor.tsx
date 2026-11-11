import { Suspense, lazy, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileWarning, ShieldAlert } from 'lucide-react';
import {
  moveScreenOnBoard,
  setProp,
  setSpacing,
  setString,
  type Command,
  type DropPosition,
  type RnjbDocument,
  type SpacingTarget,
} from '@rnjb/core';
import { Button, EmptyState, Spinner } from '@rnjb/ui';
import { useService } from '../services/service-store.ts';
import { useLibraries } from '../services/library-store.ts';
import { useHookPacks } from '../services/hooks-store.ts';
import { useT } from '../app/preferences.ts';
import { ErrorBoundary } from '../app/ErrorBoundary.tsx';
import { useOnboarding } from '../app/onboarding.ts';
import { useDialogs } from '../app/dialogs-store.ts';
import { closeTab, loadTab } from '../app/persistence.ts';
import { reportError } from '../app/report-error.ts';
import { canEdit, useTabs, type DocumentTab, type ViewState } from '../app/tabs-store.ts';
import { Board } from './Board.tsx';
import { Inspector } from './Inspector.tsx';
import { LeftPanel } from './LeftPanel.tsx';
import { ProblemsPanel } from './ProblemsPanel.tsx';
import { TopBar } from './TopBar.tsx';
import { computeProblems } from './problems.ts';
import {
  insertComponentCommand,
  moveNodeCommand,
  planInsertion,
  planNodeMove,
  type DraggedComponent,
} from './insert-component.ts';
import { nextSelection } from './selection.ts';

const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const Tour = lazy(() => import('./Tour.tsx').then((m) => ({ default: m.Tour })));

/** The coachmarks, once the welcome is closed and no other dialog is in the way. */
function TourWhenDue() {
  const due = useOnboarding((state) => state.tour && !state.welcome);
  const dialog = useDialogs((state) => state.open);
  return due && !dialog ? (
    <Suspense fallback={null}>
      <Tour />
    </Suspense>
  ) : null;
}

export function Editor({ tab }: { tab: DocumentTab }) {
  const i18n = useT();
  if (tab.status === 'failed' || (tab.status !== 'ready' && !tab.document)) {
    return tab.status === 'failed' ? (
      <div className="flex h-full items-center justify-center bg-canvas">
        <EmptyState
          icon={<FileWarning size={20} className="text-danger" />}
          title={i18n.t('editor.load.failed', { name: tab.title })}
          actions={
            <>
              <Button size="sm" onClick={() => void loadTab(tab.id)}>
                {i18n.t('common.retry')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void closeTab(tab.id)}>
                {i18n.t('editor.load.close')}
              </Button>
            </>
          }
        >
          {tab.fileError
            ? `${i18n.error(tab.fileError.code, tab.fileError.params).message} ${i18n.error(tab.fileError.code, tab.fileError.params).action}`
            : null}
        </EmptyState>
      </div>
    ) : (
      <div
        className="flex h-full items-center justify-center gap-2 bg-canvas text-sm text-fg-muted"
        aria-busy="true"
      >
        <Spinner size={14} />
        {i18n.t('editor.load.loading', { name: tab.title })}
      </div>
    );
  }
  return <LoadedEditor tab={tab} document={tab.document as RnjbDocument} />;
}

function LoadedEditor({ tab, document }: { tab: DocumentTab; document: RnjbDocument }) {
  const i18n = useT();
  const updateView = useTabs((state) => state.updateView);
  const settings = useService((state) => state.settings);
  const packs = useLibraries((state) => state.packs);
  const hookPacks = useHookPacks((state) => state.packs);
  const loadHookPacks = useHookPacks((state) => state.load);
  const online = useService((state) => state.status === 'online');
  useEffect(() => {
    if (online) loadHookPacks().catch(() => undefined);
  }, [online, loadHookPacks]);
  const wide = useMediaQuery('(min-width: 1280px)');
  const usable = useMediaQuery('(min-width: 1024px)');
  // Between 1024 and 1279 px panels start collapsed and open on demand (§10.2).
  const [leftOverride, setLeftOverride] = useState<boolean>();
  const [rightOverride, setRightOverride] = useState<boolean>();
  const leftOpen = leftOverride ?? wide;
  const rightOpen = rightOverride ?? wide;

  const { view } = tab;
  const editable = canEdit(tab);
  const screen = document.screens.find((candidate) => candidate.id === view.selectedScreenId);
  const node = view.selectedNodeId ? screen?.nodes[view.selectedNodeId] : undefined;
  const resolved = new Set(Object.keys(settings?.librarySources ?? {}));
  const problems = computeProblems(document, tab.issues, resolved, {
    hooks: hookPacks,
    libraries: packs,
  });

  /** Runs a command on this tab; invalid operations are reported, never thrown at React. */
  const run = (command: Command) => {
    try {
      useTabs.getState().apply(tab.id, command);
    } catch (error) {
      reportError(error, i18n);
    }
  };
  const onMoveScreen = editable
    ? (screenId: string, position: { x: number; y: number }) =>
        run(moveScreenOnBoard(screenId, position))
    : undefined;

  const onView = (patch: Partial<ViewState>) => updateView(tab.id, patch);
  const onSelect = (screenId: string, nodeId?: string, additive = false) => {
    const target = document.screens.find((candidate) => candidate.id === screenId);
    const sameScreen = screenId === view.selectedScreenId;
    onView({
      selectedScreenId: screenId,
      ...nextSelection(view, screenId, nodeId, additive),
      stateId: sameScreen ? view.stateId : target?.states[0]?.id,
    });
  };

  const onInsertComponent =
    editable && screen
      ? (item: DraggedComponent, targetNodeId?: string) => {
          const command = insertComponentCommand(screen, packs, item, targetNodeId, (nodeId) =>
            onSelect(screen.id, nodeId),
          );
          if (command) run(command);
          else toast.error(i18n.t('editor.catalog.cannotNest'));
        }
      : undefined;
  const canInsertComponent = screen
    ? (item: DraggedComponent, targetNodeId?: string) =>
        planInsertion(screen, packs, item, targetNodeId) !== undefined
    : undefined;
  const onEditText =
    editable && screen
      ? (nodeId: string, prop: string, text: string) => {
          const value =
            screen.nodes[nodeId]?.kind === 'component'
              ? screen.nodes[nodeId].props[prop]
              : undefined;
          run(
            value?.type === 'string'
              ? setString(value.key, text)
              : setProp(screen.id, nodeId, prop, { type: 'literal', value: text }),
          );
        }
      : undefined;
  const onSetSpacing =
    editable && screen
      ? (nodeId: string, target: SpacingTarget, value: number | undefined) =>
          run(
            setSpacing(
              screen.id,
              nodeId,
              target,
              value === undefined ? undefined : { type: 'literal', value },
            ),
          )
      : undefined;
  const onMoveNode =
    editable && screen
      ? (nodeId: string, targetId: string, position: DropPosition) => {
          const command = moveNodeCommand(screen, packs, nodeId, targetId, position);
          if (command) run(command);
        }
      : undefined;
  const canMoveNode = screen
    ? (nodeId: string, targetId: string, position: DropPosition) =>
        planNodeMove(screen, packs, nodeId, targetId, position) !== undefined
    : undefined;

  if (!usable) {
    return (
      <div className="flex h-full flex-col">
        <div
          role="alert"
          className="shrink-0 border-b border-warning-line bg-warning-subtle px-4 py-2 text-xs text-warning-fg"
        >
          <strong className="font-semibold">{i18n.t('narrow.title')}.</strong>{' '}
          {i18n.t('narrow.body')}
        </div>
        <div className="min-h-0 flex-1">
          <Board
            document={document}
            selectedScreenId={view.selectedScreenId}
            selectedNodeId={view.selectedNodeId}
            onSelect={onSelect}
            onMoveScreen={onMoveScreen}
          />
        </div>
      </div>
    );
  }

  const recoveryText = tab.issues
    .map((issue) =>
      issue.code === 'RNJB-202'
        ? i18n.t('editor.recovery.newer', {
            file: issue.params.fileVersion ?? '?',
            platform: issue.params.platformVersion ?? '?',
          })
        : issue.code === 'RNJB-203'
          ? i18n.t('editor.recovery.checksum')
          : undefined,
    )
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TourWhenDue />
      <TopBar
        tab={tab}
        document={document}
        screen={screen}
        problems={problems}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOverride(!leftOpen)}
        onToggleRight={() => setRightOverride(!rightOpen)}
        onView={onView}
        onRun={run}
      />
      {tab.mode === 'recovery' && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-warning-line bg-warning-subtle px-4 py-2 text-xs text-warning-fg"
        >
          <ShieldAlert size={14} aria-hidden className="mt-px shrink-0" />
          <p>
            <strong className="font-semibold">{i18n.t('editor.recovery.title')}.</strong>{' '}
            {recoveryText}
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {leftOpen && (
          <aside
            data-tour="left"
            className="w-[264px] shrink-0 border-r border-line-subtle bg-panel"
          >
            <ErrorBoundary area={i18n.t('editor.panels.left')} i18n={i18n}>
              <LeftPanel
                tabId={tab.id}
                editable={editable}
                document={document}
                panel={view.leftPanel}
                onPanelChange={(leftPanel) => onView({ leftPanel })}
                screen={screen}
                selectedNodeId={view.selectedNodeId}
                extraNodeIds={view.extraNodeIds}
                onSelect={onSelect}
                onRun={run}
                onInsertComponent={onInsertComponent}
                onMoveNode={onMoveNode}
                canMoveNode={canMoveNode}
                trashHours={settings?.trashRetentionHours ?? 48}
              />
            </ErrorBoundary>
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ErrorBoundary
              area={i18n.t('editor.board.label')}
              i18n={i18n}
              className="h-full bg-canvas"
            >
              <Board
                document={document}
                selectedScreenId={view.selectedScreenId}
                selectedNodeId={view.selectedNodeId}
                extraNodeIds={view.extraNodeIds}
                onSelect={onSelect}
                onMoveScreen={onMoveScreen}
                previewTheme={view.previewTheme}
                stateId={view.stateId}
                onInsertComponent={onInsertComponent}
                canInsertComponent={canInsertComponent}
                onEditText={onEditText}
                onSetSpacing={onSetSpacing}
              />
            </ErrorBoundary>
          </div>
          {view.problemsOpen && (
            <ProblemsPanel
              problems={problems}
              onClose={() => onView({ problemsOpen: false })}
              onSelectScreen={(screenId) => onSelect(screenId)}
            />
          )}
        </main>
        {rightOpen && (
          <aside
            data-tour="inspector"
            aria-label={i18n.t('editor.inspector.label')}
            className="w-[320px] shrink-0 border-l border-line-subtle bg-panel"
          >
            <ErrorBoundary area={i18n.t('editor.inspector.label')} i18n={i18n}>
              <Inspector
                tabId={tab.id}
                editable={editable}
                document={document}
                screen={screen}
                node={node}
              />
            </ErrorBoundary>
          </aside>
        )}
      </div>
    </div>
  );
}
