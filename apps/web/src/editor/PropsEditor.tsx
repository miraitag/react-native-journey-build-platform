import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  convertPropToString,
  defaultPropValue,
  setProp,
  setString,
  type Command,
  type ComponentNode,
  type PropValue,
  type PropValueType,
} from '@rnjb/core';
import type { ComponentManifest, LibraryPack } from '@rnjb/pack-schema';
import {
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Select,
  Switch,
} from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { CommitInput } from './CommitInput.tsx';
import { convertedValue, convertibleTypes, seedText, tokenOptions } from './prop-conversion.ts';
import { literalToInput, orderPropNames, parseLiteralInput } from './prop-editing.ts';

type PropManifest = ComponentManifest['props'][number];

interface PropsEditorProps {
  node: ComponentNode;
  screenId: string;
  manifest: ComponentManifest | undefined;
  /** Library pack of the node: source of tokens and icon names. */
  pack?: LibraryPack | undefined;
  strings: Record<string, string>;
  editable: boolean;
  onRun: (command: Command) => void;
  /** Read-only rendering for values that have no inline control (token, icon, binding). */
  renderValue: (value: PropValue) => ReactNode;
}

function LiteralControl({
  name,
  kind,
  options,
  value,
  onChange,
}: {
  name: string;
  kind: string;
  options: PropManifest['options'];
  value: Extract<PropValue, { type: 'literal' }>;
  onChange: (value: PropValue) => void;
}) {
  if (typeof value.value === 'boolean') {
    return (
      <Switch
        label={name}
        checked={value.value}
        onCheckedChange={(checked) => onChange({ type: 'literal', value: checked })}
      />
    );
  }
  if (options && options.length > 0) {
    const current = String(value.value);
    return (
      <Select
        aria-label={name}
        value={current}
        onChange={(event) => {
          const picked = options.find((option) => String(option) === event.target.value);
          if (picked !== undefined) onChange({ type: 'literal', value: picked });
        }}
      >
        {!options.some((option) => String(option) === current) && (
          <option value={current}>{current}</option>
        )}
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </Select>
    );
  }
  return (
    <CommitInput
      label={name}
      value={literalToInput(value)}
      onCommit={(text) => {
        const parsed = parseLiteralInput(kind, text);
        if (parsed) onChange(parsed);
      }}
    />
  );
}

/** Above this many props the inspector offers a filter. */
const FILTER_FROM = 12;

/**
 * Props of one component node (§9.4): one row per manifest prop plus any extra prop the node
 * already has. The control follows the value type; unset props offer a typed default.
 */
export function PropsEditor({
  node,
  screenId,
  manifest,
  pack,
  strings,
  editable,
  onRun,
  renderValue,
}: PropsEditorProps) {
  const i18n = useT();
  const [query, setQuery] = useState('');
  const byName = new Map(manifest?.props.map((prop) => [prop.name, prop]));
  const all = orderPropNames(
    [
      ...new Set([...(manifest?.props.map((prop) => prop.name) ?? []), ...Object.keys(node.props)]),
    ].filter((name) => name !== 'children' || node.props[name] !== undefined),
    (name) => node.props[name] !== undefined,
    (name) => byName.get(name)?.optional === false,
  );
  const needle = query.trim().toLowerCase();
  const names = needle ? all.filter((name) => name.toLowerCase().includes(needle)) : all;

  if (all.length === 0) {
    return <p className="py-2 text-xs text-fg-muted">{i18n.t('editor.inspector.noProps')}</p>;
  }

  const set = (name: string, value: PropValue | undefined) =>
    onRun(setProp(screenId, node.id, name, value));
  const convertTypes = (name: string, current: PropValueType) =>
    convertibleTypes(name, byName.get(name), manifest, pack, current);
  const convert = (name: string, target: PropValueType) => {
    const current = node.props[name];
    if (target === 'string') {
      onRun(convertPropToString(screenId, node.id, name, seedText(current, strings)));
      return;
    }
    const next = convertedValue(
      target,
      current,
      strings,
      byName.get(name),
      node.ref.component,
      pack,
    );
    if (next) set(name, next);
  };

  return (
    <>
      {all.length > FILTER_FROM && (
        <Input
          size="sm"
          type="search"
          className="mb-2"
          aria-label={i18n.t('editor.inspector.filterProps')}
          placeholder={i18n.t('editor.inspector.filterProps')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <dl>
        {names.map((name) => {
          const value = node.props[name];
          const prop = byName.get(name);
          const control = (() => {
            if (value === undefined) {
              const initial = prop && defaultPropValue(prop, node.ref.component);
              return editable && initial ? (
                <IconButton
                  label={i18n.t('editor.inspector.setProp', { name })}
                  icon={<Plus size={12} />}
                  onClick={() => set(name, initial)}
                />
              ) : (
                <span className="text-2xs text-fg-subtle">{prop?.type ?? '—'}</span>
              );
            }
            if (!editable) return renderValue(value);
            switch (value.type) {
              case 'literal':
                return (
                  <LiteralControl
                    name={name}
                    kind={prop?.kind ?? 'unknown'}
                    options={prop?.options}
                    value={value}
                    onChange={(next) => set(name, next)}
                  />
                );
              case 'string':
                return (
                  <CommitInput
                    label={name}
                    value={strings[value.key] ?? ''}
                    onCommit={(text) => onRun(setString(value.key, text))}
                  />
                );
              case 'expression':
                // Edited as text and exported as is; the preview never evaluates it.
                return (
                  <CommitInput
                    mono
                    label={name}
                    value={value.code}
                    onCommit={(code) => set(name, { type: 'expression', code })}
                  />
                );
              case 'token': {
                const options = tokenOptions(pack);
                const found = options.findIndex(
                  (option) => option.group === value.group && option.name === value.name,
                );
                return (
                  <Select
                    aria-label={i18n.t('editor.inspector.pickToken', { name })}
                    value={found === -1 ? 'current' : String(found)}
                    onChange={(event) => {
                      const picked = options[Number(event.target.value)];
                      if (picked) set(name, { type: 'token', ...picked });
                    }}
                  >
                    {found === -1 && (
                      <option value="current">{`${value.group}.${value.name}`}</option>
                    )}
                    {options.map((option, index) => (
                      <option key={`${option.group}.${option.name}`} value={String(index)}>
                        {`${option.group}.${option.name}`}
                      </option>
                    ))}
                  </Select>
                );
              }
              case 'icon': {
                const names = pack?.icons?.names ?? [];
                const listId = `rnjb-icons-${node.id}-${name}`;
                return (
                  <>
                    <CommitInput
                      mono
                      label={i18n.t('editor.inspector.pickIcon', { name })}
                      value={value.name}
                      list={listId}
                      onCommit={(text) => {
                        const picked = text.trim();
                        if (names.length === 0 || names.includes(picked)) {
                          set(name, { type: 'icon', name: picked });
                        } else {
                          toast.error(i18n.t('editor.inspector.iconUnknown', { name: picked }));
                        }
                      }}
                    />
                    <datalist id={listId}>
                      {names.slice(0, 1000).map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </>
                );
              }
              default:
                return renderValue(value);
            }
          })();
          return (
            <div key={name} className="grid grid-cols-[96px_1fr_auto] items-center gap-2 py-1">
              <dt className="truncate font-mono text-2xs text-fg-muted" title={name}>
                {name}
              </dt>
              <dd className="min-w-0">{control}</dd>
              {editable && value !== undefined && (
                <span className="flex">
                  {convertTypes(name, value.type).length > 0 && (
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton
                          label={i18n.t('editor.inspector.changeType', { name })}
                          icon={<ArrowLeftRight size={12} />}
                        />
                      </MenuTrigger>
                      <MenuContent align="end">
                        {convertTypes(name, value.type).map((type) => (
                          <MenuItem key={type} onSelect={() => convert(name, type)}>
                            {i18n.t(`editor.valueTypes.${type}`)}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                  )}
                  <IconButton
                    label={i18n.t('editor.inspector.clearProp', { name })}
                    icon={<X size={12} />}
                    onClick={() => set(name, undefined)}
                  />
                </span>
              )}
            </div>
          );
        })}
      </dl>
    </>
  );
}
