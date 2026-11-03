import { useState, type DragEvent, type ReactNode } from 'react';
import {
  Blocks,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Flag,
  Layers,
  LayoutGrid,
  ListChecks,
  Workflow,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  addScreen,
  duplicateScreen,
  renameScreen,
  setInitialScreen,
  type Command,
  type DropPosition,
  type RnjbDocument,
  type Screen,
  type TrashItem,
} from '@rnjb/core';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  WithTooltip,
  cx,
} from '@rnjb/ui';
import type { MessageKey } from '@rnjb/i18n';
import { useT } from '../app/preferences.ts';
import {
  deleteForever,
  remainingLabel,
  restoreItem,
  trashScreen,
  useDocumentTrash,
  useNow,
} from '../app/trash.ts';
import { flattenTree } from './Board.tsx';
import { FRAME_HEIGHT, FRAME_WIDTH } from './board-geometry.ts';
import { defaultProfile } from '@rnjb/profiles';
import { BlocksPanel } from './BlocksPanel.tsx';
import { CatalogPanel } from './CatalogPanel.tsx';
import { DataPanel, FormsPanel } from './DataForms.tsx';
import { LogicPanel } from './LogicPanel.tsx';
import type { DraggedComponent } from './insert-component.ts';
const PANELS: { id: string; key: MessageKey; icon: ReactNode }[] = [
  { id: 'catalog', key: 'editor.panels.catalog', icon: <Package size={15} /> },
  { id: 'blocks', key: 'editor.panels.blocks', icon: <Blocks size={15} /> },
  { id: 'layers', key: 'editor.panels.layers', icon: <Layers size={15} /> },
  { id: 'screens', key: 'editor.panels.screens', icon: <LayoutGrid size={15} /> },
  { id: 'forms', key: 'editor.panels.forms', icon: <ListChecks size={15} /> },
  { id: 'logic', key: 'editor.panels.logic', icon: <Workflow size={15} /> },
  { id: 'data', key: 'editor.panels.data', icon: <Database size={15} /> },
  { id: 'trash', key: 'editor.panels.trash', icon: <Trash2 size={15} /> },
];

interface LeftPanelProps {
  tabId: string;
  editable: boolean;
  document: RnjbDocument;
  panel: string;
  onPanelChange: (panel: string) => void;
  screen: Screen | undefined;
  selectedNodeId: string | undefined;
  extraNodeIds?: readonly string[] | undefined;
  onSelect: (screenId: string, nodeId?: string, additive?: boolean) => void;
  onRun: (command: Command) => void;
  /** Absent when the document is read-only or no screen is selected. */
  onInsertComponent?: ((item: DraggedComponent, targetNodeId?: string) => void) | undefined;
  /** Layers reorder; absent when the document is read-only. */
  onMoveNode?: ((nodeId: string, targetId: string, position: DropPosition) => void) | undefined;
  canMoveNode?: ((nodeId: string, targetId: string, position: DropPosition) => boolean) | undefined;
  trashHours: number;
}

export function LeftPanel({
  tabId,
  editable,
  document,
  panel,
  onPanelChange,
  screen,
  selectedNodeId,
  extraNodeIds,
  onSelect,
  onRun,
  onInsertComponent,
  onMoveNode,
  canMoveNode,
  trashHours,
}: LeftPanelProps) {
  const i18n = useT();
  const current = PANELS.find((candidate) => candidate.id === panel) ?? PANELS[3];
  return (
    <Tabs value={panel} onValueChange={onPanelChange} className="flex h-full min-h-0 flex-col">
      <TabsList
        label={i18n.t('editor.panels.left')}
        className="h-9 shrink-0 border-b border-line-subtle px-1"
      >
        {PANELS.map(({ id, key, icon }) => (
          <WithTooltip key={id} label={i18n.t(key)}>
            <span className="inline-flex">
              <TabsTrigger value={id} className="w-8 justify-center px-0">
                <span aria-hidden>{icon}</span>
                <span className="sr-only">{i18n.t(key)}</span>
              </TabsTrigger>
            </span>
          </WithTooltip>
        ))}
      </TabsList>
      <h2 className="shrink-0 px-3 pt-3 pb-1 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
        {i18n.t(current?.key ?? 'editor.panels.screens')}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto">
        <TabsContent value="catalog">
          <CatalogPanel
            onAdd={
              onInsertComponent && screen
                ? (item) => onInsertComponent(item, selectedNodeId)
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value="blocks">
          <BlocksPanel
            document={document}
            screen={screen}
            selection={selectedNodeId ? [selectedNodeId, ...(extraNodeIds ?? [])] : []}
            onAdd={
              onInsertComponent && screen
                ? (item) => onInsertComponent(item, selectedNodeId)
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value="layers">
          {screen ? (
            <LayerTree
              screen={screen}
              selectedNodeId={selectedNodeId}
              extraNodeIds={extraNodeIds}
              onSelect={onSelect}
              onMoveNode={onMoveNode}
              canMoveNode={canMoveNode}
            />
          ) : (
            <EmptyState title={i18n.t('editor.layers.emptyTitle')}>
              {i18n.t('editor.layers.emptyBody')}
            </EmptyState>
          )}
        </TabsContent>
        <TabsContent value="screens">
          <ScreenList
            tabId={tabId}
            editable={editable}
            document={document}
            selectedScreenId={screen?.id}
            onSelect={onSelect}
            onRun={onRun}
          />
        </TabsContent>
        <TabsContent value="forms">
          <FormsPanel document={document} editable={editable} screenId={screen?.id} onRun={onRun} />
        </TabsContent>
        <TabsContent value="logic">
          <LogicPanel document={document} screen={screen} editable={editable} onRun={onRun} />
        </TabsContent>
        <TabsContent value="data">
          <DataPanel document={document} editable={editable} onRun={onRun} />
        </TabsContent>
        <TabsContent value="trash">
          <DocumentTrash
            tabId={tabId}
            editable={editable}
            document={document}
            trashHours={trashHours}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

const rowClass = (selected: boolean, size: 'md' | 'sm' = 'md') =>
  cx(
    'flex w-full items-center gap-2 rounded-md px-2 text-left',
    size === 'md' ? 'h-7 text-sm' : 'h-6 font-mono text-2xs',
    selected ? 'bg-accent-subtle text-accent-fg' : 'text-fg hover:bg-hover',
  );

function ScreenList({
  tabId,
  editable,
  document,
  selectedScreenId,
  onSelect,
  onRun,
}: {
  tabId: string;
  editable: boolean;
  document: RnjbDocument;
  selectedScreenId: string | undefined;
  onSelect: (screenId: string) => void;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const [renaming, setRenaming] = useState<string>();
  const create = () => {
    const base =
      document.screens.find((candidate) => candidate.id === selectedScreenId) ??
      document.screens[0];
    const root = base?.nodes[base.rootId];
    const ref =
      root?.kind === 'component'
        ? root.ref
        : { package: 'react-native', component: 'View', version: '*' };
    const right = Math.max(
      -120 - FRAME_WIDTH,
      ...document.screens.map((screen) => document.board.positions[screen.id]?.x ?? 0),
    );
    onRun(
      addScreen(
        {
          name: i18n.t('editor.screens.newName', { n: String(document.screens.length + 1) }),
          root: ref,
          position: { x: right + FRAME_WIDTH + 120, y: 0 },
          initialStates: defaultProfile.conventions.initialStates,
        },
        onSelect,
      ),
    );
  };
  const header = editable && (
    <div className="px-2 pb-1.5">
      <Button size="sm" variant="secondary" className="w-full" onClick={create}>
        <Plus size={13} aria-hidden />
        {i18n.t('editor.screens.add')}
      </Button>
    </div>
  );
  if (document.screens.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={i18n.t('editor.screens.emptyTitle')}>
          {i18n.t('editor.screens.emptyBody')}
        </EmptyState>
      </>
    );
  }
  return (
    <>
      {header}
      <ul className="flex flex-col gap-px px-1.5 pb-2">
        {document.screens.map((screen) => {
          const initial = document.board.initialScreenId === screen.id;
          if (renaming === screen.id) {
            return (
              <li key={screen.id}>
                <RenameInput
                  initial={screen.name}
                  label={i18n.t('editor.screens.rename')}
                  onDone={(name) => {
                    setRenaming(undefined);
                    if (name && name !== screen.name) onRun(renameScreen(screen.id, name));
                  }}
                />
              </li>
            );
          }
          return (
            <li key={screen.id} className="group relative">
              <button
                type="button"
                aria-current={screen.id === selectedScreenId || undefined}
                onClick={() => onSelect(screen.id)}
                onDoubleClick={() => editable && setRenaming(screen.id)}
                className={cx(rowClass(screen.id === selectedScreenId), editable && 'pr-8')}
              >
                <span className="min-w-0 flex-1 truncate">{screen.name}</span>
                {initial && <Badge tone="accent">{i18n.t('editor.screens.initial')}</Badge>}
                <span className="tabular shrink-0 text-2xs text-fg-subtle">
                  {Object.keys(screen.nodes).length}
                </span>
              </button>
              {editable && (
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={i18n.t('editor.screens.actions', { screen: screen.name })}
                      className="absolute top-0.5 right-1 inline-flex size-6 items-center justify-center rounded-md text-fg-muted opacity-0 group-hover:opacity-100 hover:bg-active hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal size={14} aria-hidden />
                    </button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem icon={<Pencil size={14} />} onSelect={() => setRenaming(screen.id)}>
                      {i18n.t('editor.screens.rename')}
                    </MenuItem>
                    <MenuItem
                      icon={<Copy size={14} />}
                      onSelect={() => {
                        const at = document.board.positions[screen.id] ?? { x: 0, y: 0 };
                        onRun(
                          duplicateScreen(
                            screen.id,
                            i18n.t('editor.screens.copyName', { screen: screen.name }),
                            { x: at.x + FRAME_WIDTH + 120, y: at.y + FRAME_HEIGHT + 120 },
                            onSelect,
                          ),
                        );
                      }}
                    >
                      {i18n.t('editor.screens.duplicate')}
                    </MenuItem>
                    <MenuItem
                      icon={<Flag size={14} />}
                      disabled={initial}
                      onSelect={() => onRun(setInitialScreen(screen.id))}
                    >
                      {i18n.t('editor.screens.setInitial')}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      tone="danger"
                      icon={<Trash2 size={14} />}
                      onSelect={() => void trashScreen(tabId, screen.id)}
                    >
                      {i18n.t('editor.screens.delete')}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function RenameInput({
  initial,
  label,
  onDone,
}: {
  initial: string;
  label: string;
  onDone: (value: string | undefined) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Input
      size="sm"
      autoFocus
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={() => onDone(value.trim() || undefined)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(value.trim() || undefined);
        if (event.key === 'Escape') onDone(undefined);
      }}
    />
  );
}

/** Items already back in the document (e.g. after an undo) are not listed. */
function isPresent(item: TrashItem, document: RnjbDocument): boolean {
  if (item.kind === 'screen') {
    return document.screens.some((screen) => screen.id === item.payload.screen.id);
  }
  if (item.kind === 'node') {
    const screen = document.screens.find((candidate) => candidate.id === item.payload.screenId);
    return Boolean(screen?.nodes[item.payload.nodeId]);
  }
  return false;
}

function DocumentTrash({
  tabId,
  editable,
  document,
  trashHours,
}: {
  tabId: string;
  editable: boolean;
  document: RnjbDocument;
  trashHours: number;
}) {
  const i18n = useT();
  const now = useNow();
  const items = useDocumentTrash(tabId).filter((item) => !isPresent(item, document));
  if (items.length === 0) {
    return (
      <EmptyState title={i18n.t('editor.trash.emptyTitle')}>
        {i18n.t('editor.trash.emptyBody', { hours: trashHours })}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-2 pb-2">
      <ul className="flex flex-col gap-px px-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex h-9 items-center gap-2 rounded-md px-2 hover:bg-hover">
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm">{item.label}</span>
              <span className="truncate text-2xs text-fg-subtle">
                {i18n.t(item.kind === 'screen' ? 'trash.kind.screen' : 'trash.kind.node')} ·{' '}
                {remainingLabel(item, now, i18n)}
              </span>
            </div>
            <IconButton
              size="sm"
              label={i18n.t('trash.restoreNamed', { name: item.label })}
              icon={<RotateCcw size={14} />}
              disabled={!editable}
              onClick={() => void restoreItem(item)}
            />
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        className="mx-3 self-start"
        onClick={() => void deleteForever(items.map((item) => item.id))}
      >
        {i18n.t('trash.empty')}
      </Button>
    </div>
  );
}

/** Pointer in the top quarter of a row = before, bottom quarter = after, otherwise inside. */
function dropPositionAt(event: DragEvent<HTMLElement>): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
}

function LayerTree({
  screen,
  selectedNodeId,
  extraNodeIds,
  onSelect,
  onMoveNode,
  canMoveNode,
}: {
  screen: Screen;
  selectedNodeId: string | undefined;
  extraNodeIds?: readonly string[] | undefined;
  onSelect: (screenId: string, nodeId?: string, additive?: boolean) => void;
  onMoveNode: LeftPanelProps['onMoveNode'];
  canMoveNode: LeftPanelProps['canMoveNode'];
}) {
  const i18n = useT();
  const codeLabel = i18n.t('editor.layers.code');
  const [dragId, setDragId] = useState<string>();
  const [hover, setHover] = useState<{ id: string; position: DropPosition; valid: boolean }>();
  const movable = onMoveNode !== undefined;

  const parentOf = new Map<string, string>();
  for (const node of Object.values(screen.nodes)) {
    for (const childId of node.children) parentOf.set(childId, node.id);
  }
  const siblingsOf = (id: string) => {
    const parentId = parentOf.get(id);
    return parentId ? (screen.nodes[parentId]?.children ?? []) : [];
  };
  const endDrag = () => {
    setDragId(undefined);
    setHover(undefined);
  };

  return (
    <ul
      aria-label={i18n.t('editor.layers.tree', { screen: screen.name })}
      className="flex flex-col gap-px px-1.5 pb-2"
    >
      {flattenTree(screen).map(({ node, depth }) => {
        const selected = node.id === selectedNodeId || extraNodeIds?.includes(node.id) === true;
        const name =
          node.kind === 'component' ? (node.name ?? node.ref.component) : (node.name ?? codeLabel);
        const siblings = siblingsOf(node.id);
        const index = siblings.indexOf(node.id);
        const previous = index > 0 ? siblings[index - 1] : undefined;
        const next = index >= 0 ? siblings[index + 1] : undefined;
        const over = hover?.id === node.id ? hover : undefined;
        return (
          <li
            key={node.id}
            draggable={movable && node.id !== screen.rootId}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              // Firefox does not start a drag without data.
              event.dataTransfer.setData('text/plain', node.id);
              setDragId(node.id);
            }}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              if (!dragId || !canMoveNode) return;
              const position = dropPositionAt(event);
              const valid = canMoveNode(dragId, node.id, position);
              if (valid) event.preventDefault();
              event.dataTransfer.dropEffect = valid ? 'move' : 'none';
              setHover((current) =>
                current?.id === node.id && current.position === position && current.valid === valid
                  ? current
                  : { id: node.id, position, valid },
              );
            }}
            onDragLeave={() => setHover(undefined)}
            onDrop={(event) => {
              event.preventDefault();
              const position = dropPositionAt(event);
              if (dragId && canMoveNode?.(dragId, node.id, position)) {
                onMoveNode?.(dragId, node.id, position);
              }
              endDrag();
            }}
            className={cx(
              'group relative',
              dragId === node.id && 'opacity-50',
              over &&
                over.position === 'inside' &&
                (over.valid
                  ? 'rounded-md shadow-[inset_0_0_0_1.5px_var(--selection-color)]'
                  : 'rounded-md shadow-[inset_0_0_0_1.5px_var(--drop-invalid)]'),
              over &&
                over.position === 'before' &&
                (over.valid
                  ? 'shadow-[0_-2px_0_0_var(--selection-color)]'
                  : 'shadow-[0_-2px_0_0_var(--drop-invalid)]'),
              over &&
                over.position === 'after' &&
                (over.valid
                  ? 'shadow-[0_2px_0_0_var(--selection-color)]'
                  : 'shadow-[0_2px_0_0_var(--drop-invalid)]'),
            )}
          >
            <button
              type="button"
              aria-current={selected || undefined}
              onClick={(event) => onSelect(screen.id, node.id, event.shiftKey)}
              style={{ paddingLeft: 8 + Math.min(depth, 12) * 12 }}
              className={cx(rowClass(selected, 'sm'), movable && selected && 'pr-14')}
            >
              <span className={cx('truncate', node.kind === 'code' && 'italic text-fg-muted')}>
                {name}
              </span>
            </button>
            {movable && node.id === selectedNodeId && node.id !== screen.rootId && (
              <span className="absolute top-0 right-1 flex h-6 items-center">
                <IconButton
                  size="sm"
                  label={i18n.t('editor.layers.moveUp', { name })}
                  icon={<ChevronUp size={12} />}
                  disabled={previous === undefined || !canMoveNode?.(node.id, previous, 'before')}
                  onClick={() =>
                    previous !== undefined && onMoveNode?.(node.id, previous, 'before')
                  }
                />
                <IconButton
                  size="sm"
                  label={i18n.t('editor.layers.moveDown', { name })}
                  icon={<ChevronDown size={12} />}
                  disabled={next === undefined || !canMoveNode?.(node.id, next, 'after')}
                  onClick={() => next !== undefined && onMoveNode?.(node.id, next, 'after')}
                />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
