import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Braces,
  Equal,
  Link2,
  Plus,
  Shapes,
  SwatchBook,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  addConnection,
  removeConnection,
  setConnectionParams,
  setConnectionTarget,
} from '@rnjb/core';
import type {
  Command,
  ComponentNode,
  DocumentNode,
  PropValue,
  PropValueType,
  RnjbDocument,
  Screen,
  SpacingValue,
} from '@rnjb/core';
import {
  Button,
  EmptyState,
  IconButton,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  WithTooltip,
  cx,
} from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { reportError } from '../app/report-error.ts';
import { useTabs } from '../app/tabs-store.ts';
import { trashNode } from '../app/trash.ts';
import { useLibraries } from '../services/library-store.ts';
import { formatParams, parseParams } from './nav-params.ts';
import { CommitInput } from './CommitInput.tsx';
import { PropsEditor } from './PropsEditor.tsx';
import { LayoutEditor } from './LayoutEditor.tsx';

const VALUE_ICONS: Record<PropValueType, ReactNode> = {
  literal: <Equal size={12} />,
  string: <Type size={12} />,
  token: <SwatchBook size={12} />,
  icon: <Shapes size={12} />,
  binding: <Link2 size={12} />,
  expression: <Braces size={12} />,
};

const valueText = (value: PropValue): string => {
  switch (value.type) {
    case 'literal':
      return JSON.stringify(value.value);
    case 'string':
      return value.key;
    case 'token':
      return `${value.group}.${value.name}`;
    case 'icon':
      return value.name;
    case 'binding':
      return `${value.source}.${value.path}`;
    case 'expression':
      return value.code;
  }
};

const spacingText = (value: SpacingValue): string =>
  value.type === 'literal' ? String(value.value) : `${value.group}.${value.name}`;

/** A prop value always shows its type (§9.4): glyph + typed text. */
function ValuePill({ value, strings }: { value: PropValue; strings: Record<string, string> }) {
  const i18n = useT();
  const resolved = value.type === 'string' ? strings[value.key] : undefined;
  return (
    <WithTooltip label={i18n.t(`editor.valueTypes.${value.type}`)} side="left">
      <span
        className={cx(
          'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-sm px-1.5 font-mono text-2xs',
          value.type === 'binding' || value.type === 'expression'
            ? 'bg-accent-subtle text-accent-fg'
            : 'bg-hover text-fg',
        )}
      >
        <span aria-hidden className="shrink-0 opacity-70">
          {VALUE_ICONS[value.type]}
        </span>
        <span className="sr-only">{i18n.t(`editor.valueTypes.${value.type}`)}:</span>
        <span className="truncate">{valueText(value)}</span>
        {resolved !== undefined && (
          <span className="truncate font-sans text-fg-muted">«{resolved}»</span>
        )}
      </span>
    </WithTooltip>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 py-1">
      <dt className="truncate font-mono text-2xs text-fg-muted" title={label}>
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const Plain = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-2xs text-fg">{children}</span>
);

export function Inspector({
  tabId,
  editable,
  document,
  screen,
  node,
}: {
  tabId: string;
  editable: boolean;
  document: RnjbDocument;
  screen: Screen | undefined;
  node: DocumentNode | undefined;
}) {
  const i18n = useT();
  /** Runs a command on this tab; invalid operations are reported, never thrown at React. */
  const run = (command: Command) => {
    try {
      useTabs.getState().apply(tabId, command);
    } catch (error) {
      reportError(error, i18n);
    }
  };
  if (!screen || !node) {
    return (
      <EmptyState title={i18n.t('editor.inspector.emptyTitle')}>
        {i18n.t('editor.inspector.emptyBody')}
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative border-b border-line-subtle px-3 py-2.5 pr-11">
        {editable && node.id !== screen.rootId && (
          <IconButton
            label={i18n.t('editor.inspector.delete')}
            shortcut="⌫"
            tooltipSide="left"
            icon={<Trash2 size={14} />}
            onClick={() => void trashNode(tabId, screen.id, node.id)}
            className="absolute top-2 right-2"
          />
        )}
        <p className="truncate text-sm font-medium">
          {node.kind === 'component'
            ? (node.name ?? node.ref.component)
            : (node.name ?? i18n.t('editor.layers.code'))}
        </p>
        {node.kind === 'component' && (
          <p
            className="truncate font-mono text-2xs text-fg-subtle"
            title={`${node.ref.package}@${node.ref.version}`}
          >
            {node.ref.package}@{node.ref.version}
            {node.ref.variant && ` · ${node.ref.variant}`}
          </p>
        )}
      </header>
      <Tabs defaultValue="props" className="flex min-h-0 flex-1 flex-col">
        <TabsList
          label={i18n.t('editor.inspector.label')}
          className="border-b border-line-subtle px-1 [&>button]:px-1.5"
        >
          <TabsTrigger value="props">{i18n.t('editor.inspector.props')}</TabsTrigger>
          <TabsTrigger value="layout">{i18n.t('editor.inspector.layout')}</TabsTrigger>
          <TabsTrigger value="form">{i18n.t('editor.inspector.form')}</TabsTrigger>
          <TabsTrigger value="logic">{i18n.t('editor.inspector.logic')}</TabsTrigger>
          <TabsTrigger value="navigation">{i18n.t('editor.inspector.navigation')}</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          <TabsContent value="props">
            {node.kind === 'code' ? (
              <CodeView source={node.code.source} imports={node.code.imports} />
            ) : (
              <PropsView
                node={node}
                screenId={screen.id}
                strings={document.strings}
                editable={editable}
                onRun={run}
              />
            )}
          </TabsContent>
          <TabsContent value="layout">
            {node.kind === 'component' ? (
              <LayoutPanel node={node} screenId={screen.id} editable={editable} onRun={run} />
            ) : (
              <Muted>{i18n.t('editor.inspector.noLayout')}</Muted>
            )}
          </TabsContent>
          <TabsContent value="form">
            <FormView document={document} nodeId={node.id} />
          </TabsContent>
          <TabsContent value="logic">
            {screen.logic.hooks.length === 0 ? (
              <Muted>{i18n.t('editor.inspector.logicEmpty')}</Muted>
            ) : (
              <dl>
                {screen.logic.hooks.map((hook) => (
                  <Row key={hook.id} label={hook.hook}>
                    <Plain>
                      {hook.library}@{hook.version}
                    </Plain>
                  </Row>
                ))}
              </dl>
            )}
          </TabsContent>
          <TabsContent value="navigation">
            <NavigationView
              document={document}
              screenId={screen.id}
              nodeId={node.id}
              editable={editable}
              onRun={run}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="py-2 text-xs text-fg-muted">{children}</p>
);

function PropsView({
  node,
  screenId,
  strings,
  editable,
  onRun,
}: {
  node: ComponentNode;
  screenId: string;
  strings: Record<string, string>;
  editable: boolean;
  onRun: (command: Command) => void;
}) {
  const packs = useLibraries((state) => state.packs);
  const pack = packs.find((candidate) => candidate.package === node.ref.package);
  const manifest = pack?.components.find((component) => component.name === node.ref.component);
  return (
    <PropsEditor
      node={node}
      screenId={screenId}
      manifest={manifest}
      pack={pack}
      strings={strings}
      editable={editable}
      onRun={onRun}
      renderValue={(value) => <ValuePill value={value} strings={strings} />}
    />
  );
}

/** Editable when the document is; read-only keeps the compact summary. */
function LayoutPanel({
  node,
  screenId,
  editable,
  onRun,
}: {
  node: ComponentNode;
  screenId: string;
  editable: boolean;
  onRun: (command: Command) => void;
}) {
  const packs = useLibraries((state) => state.packs);
  if (!editable) return <LayoutView node={node} />;
  const pack = packs.find((candidate) => candidate.package === node.ref.package);
  const manifest = pack?.components.find((component) => component.name === node.ref.component);
  return (
    <LayoutEditor
      node={node}
      screenId={screenId}
      scale={pack?.tokens?.spacing}
      supportsAbsolutePosition={manifest?.supportsAbsolutePosition === true}
      onRun={onRun}
    />
  );
}

function LayoutView({ node }: { node: ComponentNode }) {
  const i18n = useT();
  const layout = Object.entries(node.layout);
  const spacing: [string, SpacingValue][] = [];
  for (const kind of ['margin', 'padding'] as const) {
    for (const [side, value] of Object.entries(node.spacing[kind] ?? {}))
      spacing.push([`${kind}.${side}`, value]);
  }
  if (node.spacing.gap) spacing.push(['gap', node.spacing.gap]);
  if (layout.length === 0 && spacing.length === 0)
    return <Muted>{i18n.t('editor.inspector.noLayout')}</Muted>;
  return (
    <dl>
      {layout.map(([key, value]) => (
        <Row key={key} label={key}>
          <Plain>{String(value)}</Plain>
        </Row>
      ))}
      {spacing.map(([key, value]) => (
        <Row key={key} label={key}>
          <Plain>{spacingText(value)}</Plain>
        </Row>
      ))}
    </dl>
  );
}

function FormView({ document, nodeId }: { document: RnjbDocument; nodeId: string }) {
  const i18n = useT();
  const bound = document.forms.flatMap((form) =>
    form.fields.filter((field) => field.nodeId === nodeId).map((field) => ({ form, field })),
  );
  if (bound.length === 0) return <Muted>{i18n.t('editor.inspector.formEmpty')}</Muted>;
  return (
    <dl>
      {bound.map(({ form, field }) => (
        <Row key={field.id} label={`${form.name}.${field.name}`}>
          <Plain>
            {field.type}
            {field.required ? ` · ${i18n.t('editor.inspector.required')}` : ''}
          </Plain>
        </Row>
      ))}
    </dl>
  );
}

function NavigationView({
  document,
  screenId,
  nodeId,
  editable,
  onRun,
}: {
  document: RnjbDocument;
  screenId: string;
  nodeId: string;
  editable: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const connections = document.connections.filter(
    (connection) => connection.triggerNodeId === nodeId,
  );
  const others = document.screens.filter((screen) => screen.id !== screenId);
  const add = (
    <>
      {editable && (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={document.screens.length === 0}
          onClick={() => {
            const target = others[0] ?? document.screens[0];
            if (target) {
              onRun(
                addConnection({
                  fromScreenId: screenId,
                  triggerNodeId: nodeId,
                  toScreenId: target.id,
                  params: [],
                }),
              );
            }
          }}
        >
          <Plus size={13} aria-hidden />
          {i18n.t('editor.inspector.addNavigation')}
        </Button>
      )}
    </>
  );
  if (connections.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Muted>{i18n.t('editor.inspector.navigationEmpty')}</Muted>
        {add}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3 py-1">
        {connections.map((connection) => {
          const target = document.screens.find((screen) => screen.id === connection.toScreenId);
          const label = target?.name ?? connection.toScreenId;
          return (
            <li key={connection.id} className="flex flex-col gap-1">
              {editable ? (
                <div className="flex items-center gap-1.5">
                  <ArrowRight size={12} aria-hidden className="shrink-0 text-fg-subtle" />
                  <Select
                    aria-label={i18n.t('editor.inspector.navigationTarget')}
                    value={connection.toScreenId}
                    onChange={(event) =>
                      onRun(setConnectionTarget(connection.id, event.target.value))
                    }
                  >
                    {document.screens.map((screen) => (
                      <option key={screen.id} value={screen.id}>
                        {screen.name}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    label={i18n.t('editor.inspector.removeNavigation', { screen: label })}
                    icon={<X size={12} />}
                    onClick={() => onRun(removeConnection(connection.id))}
                  />
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs">
                  <ArrowRight size={12} aria-hidden className="text-fg-subtle" />
                  {i18n.t('editor.inspector.navigatesTo', { screen: label })}
                </span>
              )}
              {editable ? (
                <CommitInput
                  mono
                  label={i18n.t('editor.inspector.navigationParams')}
                  value={formatParams(connection.params)}
                  onCommit={(text) => {
                    const params = parseParams(text);
                    if (params) onRun(setConnectionParams(connection.id, params));
                    else toast.error(i18n.t('editor.inspector.paramsInvalid'));
                  }}
                />
              ) : (
                connection.params.length > 0 && (
                  <span className="pl-5 font-mono text-2xs text-fg-muted">
                    {formatParams(connection.params)}
                  </span>
                )
              )}
            </li>
          );
        })}
      </ul>
      {add}
    </div>
  );
}

function CodeView({ source, imports }: { source: string; imports: string[] }) {
  const i18n = useT();
  return (
    <div className="flex flex-col gap-3 py-1">
      {imports.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-2xs font-medium text-fg-subtle">
            {i18n.t('editor.inspector.imports')}
          </h4>
          <pre className="overflow-auto rounded-md bg-canvas p-2 text-2xs">
            {imports.join('\n')}
          </pre>
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h4 className="text-2xs font-medium text-fg-subtle">{i18n.t('editor.inspector.code')}</h4>
        <pre className="overflow-auto rounded-md bg-canvas p-2 text-2xs">{source}</pre>
      </section>
    </div>
  );
}
