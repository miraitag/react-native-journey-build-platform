import { Suspense, lazy, useState } from 'react';
import { Code2, Plus, Trash2 } from 'lucide-react';
import {
  addHook,
  removeHook,
  setHookBody,
  updateHook,
  type Command,
  type HookUsage,
  type RnjbDocument,
  type Screen,
} from '@rnjb/core';
import type { HooksPack } from '@rnjb/pack-schema';
import { Badge, Button, EmptyState, IconButton, Input, Select, Spinner, Switch } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { CommitInput } from './CommitInput.tsx';
import { useHookPacks } from '../services/hooks-store.ts';
import { layoutHookGraph } from './hook-graph.ts';

// Loaded only when an effect body is opened.
const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

type HookDefinition = HooksPack['hooks'][number];

const CARD = 'flex flex-col gap-2 rounded-md p-2 shadow-[inset_0_0_0_1px_var(--line-subtle)]';

export function LogicPanel({
  document,
  screen,
  editable,
  onRun,
}: {
  document: RnjbDocument;
  screen: Screen | undefined;
  editable: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const packs = useHookPacks((state) => state.packs);
  const definitions = packs.flatMap((pack) => pack.hooks);
  const [choice, setChoice] = useState('');
  if (!screen) {
    return (
      <EmptyState title={i18n.t('editor.logic.noScreenTitle')}>
        {i18n.t('editor.logic.noScreenBody')}
      </EmptyState>
    );
  }
  const { hooks } = screen.logic;
  const chosen = definitions.find(
    (definition) => `${definition.library}|${definition.name}` === choice,
  );
  const add = () => {
    if (!chosen) return;
    const version = document.libraries.find(
      (library) => library.package === chosen.library,
    )?.version;
    onRun(
      addHook(screen.id, { hook: chosen.name, library: chosen.library, version: version ?? '*' }),
    );
    setChoice('');
  };

  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <p className="text-2xs text-fg-subtle">
        {i18n.t('editor.logic.forScreen', { screen: screen.name })}
      </p>
      {hooks.length === 0 && (
        <p className="text-sm text-fg-muted">{i18n.t('editor.logic.empty')}</p>
      )}
      {hooks.length > 1 && <DependencyGraph screen={screen} />}
      {hooks.map((hook) => (
        <HookCard
          key={hook.id}
          screen={screen}
          hook={hook}
          definition={definitions.find(
            (definition) => definition.name === hook.hook && definition.library === hook.library,
          )}
          disabled={!editable}
          onRun={onRun}
        />
      ))}
      {definitions.length === 0 ? (
        <p className="text-xs text-fg-muted">{i18n.t('editor.logic.noPacks')}</p>
      ) : (
        <div className="flex items-center gap-1.5">
          <Select
            aria-label={i18n.t('editor.logic.pick')}
            disabled={!editable}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">{i18n.t('editor.logic.pickPlaceholder')}</option>
            {definitions.map((definition) => (
              <option
                key={`${definition.library}|${definition.name}`}
                value={`${definition.library}|${definition.name}`}
              >
                {definition.name} · {definition.library}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" disabled={!editable || !chosen} onClick={add}>
            <Plus size={13} aria-hidden />
            {i18n.t('editor.logic.add')}
          </Button>
        </div>
      )}
    </div>
  );
}

const COLUMN_WIDTH = 132;
const ROW_HEIGHT = 34;
const NODE_WIDTH = 108;
const NODE_HEIGHT = 22;

/** Dependency graph of the screen's hooks: dependencies on the left, dependents to the right. */
function DependencyGraph({ screen }: { screen: Screen }) {
  const i18n = useT();
  const graph = layoutHookGraph(screen.logic);
  const at = (id: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    return node
      ? { x: node.column * COLUMN_WIDTH + 4, y: node.row * ROW_HEIGHT + 4 }
      : { x: 0, y: 0 };
  };
  return (
    <svg
      role="img"
      aria-label={i18n.t('editor.logic.graph', { screen: screen.name })}
      viewBox={`0 0 ${graph.columns * COLUMN_WIDTH} ${graph.rows * ROW_HEIGHT + 4}`}
      className="w-full rounded-md bg-canvas shadow-[inset_0_0_0_1px_var(--line-subtle)]"
    >
      <defs>
        <marker
          id="hook-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="var(--fg-subtle)" />
        </marker>
      </defs>
      {graph.edges.map((edge) => {
        const from = at(edge.from);
        const to = at(edge.to);
        return (
          <line
            key={`${edge.from}-${edge.to}`}
            x1={from.x}
            y1={from.y + NODE_HEIGHT / 2}
            x2={to.x + NODE_WIDTH}
            y2={to.y + NODE_HEIGHT / 2}
            stroke="var(--fg-subtle)"
            strokeWidth={1.25}
            markerEnd="url(#hook-arrow)"
          />
        );
      })}
      {graph.nodes.map((node) => {
        const { x, y } = at(node.id);
        return (
          <g key={node.id}>
            <rect
              x={x}
              y={y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={4}
              fill="var(--panel)"
              stroke="var(--line-subtle)"
            />
            <text x={x + 6} y={y + 15} fontSize={10} fontFamily="var(--font-mono)" fill="var(--fg)">
              {node.label.length > 15 ? `${node.label.slice(0, 14)}…` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HookCard({
  screen,
  hook,
  definition,
  disabled,
  onRun,
}: {
  screen: Screen;
  hook: HookUsage;
  definition: HookDefinition | undefined;
  disabled: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const [editing, setEditing] = useState<string>();
  const [newBinding, setNewBinding] = useState({ name: '', value: '' });
  const others = screen.logic.hooks.filter((other) => other.id !== hook.id);
  const bindings = Object.entries(hook.bindings);
  const update = (patch: Parameters<typeof updateHook>[2]) =>
    onRun(updateHook(screen.id, hook.id, patch));
  const canHaveBody = definition?.isEffect === true || hook.body !== undefined;
  const presentationAllowed = definition ? definition.allowedLayers.includes('presentation') : true;

  return (
    <div role="group" aria-label={hook.hook} className={CARD}>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">{hook.hook}</span>
        {definition && (
          <Badge tone={presentationAllowed ? 'neutral' : 'danger'}>
            {definition.allowedLayers.join(' \u00b7 ')}
          </Badge>
        )}
        <IconButton
          size="sm"
          label={i18n.t('editor.logic.remove', { name: hook.hook })}
          icon={<Trash2 size={13} />}
          disabled={disabled}
          onClick={() => onRun(removeHook(screen.id, hook.id))}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="truncate font-mono text-2xs text-fg-subtle" title={hook.library}>
          {hook.library}@
        </span>
        <CommitInput
          mono
          label={i18n.t('editor.logic.version', { name: hook.hook })}
          value={hook.version}
          disabled={disabled}
          onCommit={(version) => update({ version })}
        />
      </div>

      {others.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-2xs font-medium text-fg-muted">
            {i18n.t('editor.logic.dependencies')}
          </legend>
          {others.map((other) => (
            <span key={other.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono">{other.hook}</span>
              <Switch
                label={i18n.t('editor.logic.dependsOn', { name: hook.hook, other: other.hook })}
                checked={hook.dependencies.includes(other.id)}
                onCheckedChange={(on) =>
                  update({
                    dependencies: on
                      ? [...hook.dependencies, other.id]
                      : hook.dependencies.filter((id) => id !== other.id),
                  })
                }
              />
            </span>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-fg-muted">
          {i18n.t('editor.logic.bindings')}
        </span>
        {bindings.map(([name, value]) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className="w-20 shrink-0 truncate font-mono text-2xs" title={name}>
              {name}
            </span>
            <CommitInput
              mono
              label={i18n.t('editor.logic.bindingValue', { name })}
              value={value}
              disabled={disabled}
              onCommit={(next) => update({ bindings: { ...hook.bindings, [name]: next } })}
            />
            <IconButton
              size="sm"
              label={i18n.t('editor.logic.removeBinding', { name })}
              icon={<Trash2 size={12} />}
              disabled={disabled}
              onClick={() => {
                const { [name]: _removed, ...rest } = hook.bindings;
                update({ bindings: rest });
              }}
            />
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            size="sm"
            mono
            className="w-20 shrink-0"
            aria-label={i18n.t('editor.logic.bindingName', { name: hook.hook })}
            placeholder={i18n.t('editor.logic.bindingNamePlaceholder')}
            disabled={disabled}
            spellCheck={false}
            value={newBinding.name}
            onChange={(event) => setNewBinding((state) => ({ ...state, name: event.target.value }))}
          />
          <Input
            size="sm"
            mono
            aria-label={i18n.t('editor.logic.bindingNewValue', { name: hook.hook })}
            placeholder={i18n.t('editor.logic.bindingValuePlaceholder')}
            disabled={disabled}
            spellCheck={false}
            value={newBinding.value}
            onChange={(event) =>
              setNewBinding((state) => ({ ...state, value: event.target.value }))
            }
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || !newBinding.name.trim() || !newBinding.value.trim()}
            onClick={() => {
              update({
                bindings: { ...hook.bindings, [newBinding.name.trim()]: newBinding.value.trim() },
              });
              setNewBinding({ name: '', value: '' });
            }}
          >
            <Plus size={13} aria-hidden />
            {i18n.t('editor.logic.addBinding')}
          </Button>
        </div>
      </div>

      {canHaveBody &&
        (editing === undefined ? (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setEditing(hook.body?.source ?? '')}
          >
            <Code2 size={13} aria-hidden />
            {hook.body ? i18n.t('editor.logic.editBody') : i18n.t('editor.logic.addBody')}
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Suspense
              fallback={
                <span className="flex items-center gap-2 text-xs text-fg-muted">
                  <Spinner size={12} />
                  {i18n.t('editor.logic.loadingEditor')}
                </span>
              }
            >
              <CodeEditor
                label={i18n.t('editor.logic.body', { name: hook.hook })}
                value={editing}
                readOnly={disabled}
                onChange={setEditing}
              />
            </Suspense>
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
                {i18n.t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  onRun(setHookBody(screen.id, hook.id, { source: editing }));
                  setEditing(undefined);
                }}
              >
                {i18n.t('editor.logic.saveBody')}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
