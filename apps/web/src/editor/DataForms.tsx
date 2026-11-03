import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  addForm,
  addFormField,
  addGatewayMethod,
  addModel,
  removeForm,
  removeFormField,
  removeGatewayMethod,
  removeModel,
  renameForm,
  renameModel,
  setFieldMessage,
  setFormMode,
  setModelFields,
  updateFormField,
  updateGatewayMethod,
  type Command,
  type DomainModel,
  type Form,
  type FormField,
  type GatewayMethod,
  type RnjbDocument,
} from '@rnjb/core';
import { Button, EmptyState, IconButton, Input, Select, Switch } from '@rnjb/ui';
import { useT } from '../app/preferences.ts';
import { CommitInput } from './CommitInput.tsx';
import { useLibraries } from '../services/library-store.ts';
import { useSimulatedErrors } from './simulated-errors-store.ts';

interface PanelProps {
  document: RnjbDocument;
  editable: boolean;
  onRun: (command: Command) => void;
}

function AddRow({
  label,
  placeholder,
  buttonLabel,
  disabled,
  onAdd,
}: {
  label: string;
  placeholder: string;
  buttonLabel: string;
  disabled: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        size="sm"
        mono
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && submit()}
      />
      <Button size="sm" variant="secondary" disabled={disabled || !name.trim()} onClick={submit}>
        <Plus size={13} aria-hidden />
        {buttonLabel}
      </Button>
    </div>
  );
}

const HEADING = 'text-xs font-medium';
const CARD = 'flex flex-col gap-2 rounded-md p-2 shadow-[inset_0_0_0_1px_var(--line-subtle)]';

// ---------------------------------------------------------------------------
// Data (§14.3)
// ---------------------------------------------------------------------------

const HTTP_METHODS: GatewayMethod['httpMethod'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function DataPanel({ document, editable, onRun }: PanelProps) {
  const i18n = useT();
  const { models, gateways } = document.data;
  const disabled = !editable;
  if (models.length === 0 && gateways.length === 0 && !editable) {
    return (
      <EmptyState title={i18n.t('editor.data.emptyTitle')}>
        {i18n.t('editor.data.emptyBody')}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-3 pb-3">
      <section aria-label={i18n.t('editor.data.models')} className="flex flex-col gap-2">
        <h3 className={HEADING}>{i18n.t('editor.data.models')}</h3>
        {models.map((model) => (
          <ModelCard key={model.id} model={model} disabled={disabled} onRun={onRun} />
        ))}
        <AddRow
          label={i18n.t('editor.data.modelName')}
          placeholder="UserModel"
          buttonLabel={i18n.t('editor.data.addModel')}
          disabled={disabled}
          onAdd={(name) => onRun(addModel(name))}
        />
      </section>
      <section aria-label={i18n.t('editor.data.gateways')} className="flex flex-col gap-2">
        <h3 className={HEADING}>{i18n.t('editor.data.gateways')}</h3>
        {gateways.map((method) => (
          <GatewayCard
            key={method.id}
            method={method}
            models={models}
            disabled={disabled}
            onRun={onRun}
          />
        ))}
        <AddRow
          label={i18n.t('editor.data.methodName')}
          placeholder="getUser"
          buttonLabel={i18n.t('editor.data.addMethod')}
          disabled={disabled}
          onAdd={(name) =>
            onRun(
              addGatewayMethod({
                name,
                output: models[0]?.name ?? 'void',
                httpMethod: 'GET',
                path: '/',
              }),
            )
          }
        />
      </section>
    </div>
  );
}

function ModelCard({
  model,
  disabled,
  onRun,
}: {
  model: DomainModel;
  disabled: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const setFields = (fields: DomainModel['fields']) => onRun(setModelFields(model.id, fields));
  return (
    <div role="group" aria-label={model.name} className={CARD}>
      <div className="flex items-center gap-1.5">
        <CommitInput
          mono
          label={i18n.t('editor.data.modelName')}
          value={model.name}
          disabled={disabled}
          onCommit={(name) => onRun(renameModel(model.id, name))}
        />
        <IconButton
          size="sm"
          label={i18n.t('editor.data.remove', { name: model.name })}
          icon={<Trash2 size={13} />}
          disabled={disabled}
          onClick={() => onRun(removeModel(model.id))}
        />
      </div>
      {model.fields.map((field, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <CommitInput
            mono
            className="w-24"
            label={i18n.t('editor.data.fieldName', { model: model.name })}
            value={field.name}
            disabled={disabled}
            onCommit={(name) =>
              setFields(model.fields.map((other, i) => (i === index ? { ...other, name } : other)))
            }
          />
          <CommitInput
            mono
            label={i18n.t('editor.data.fieldType', { name: field.name })}
            value={field.type}
            disabled={disabled}
            onCommit={(type) =>
              setFields(model.fields.map((other, i) => (i === index ? { ...other, type } : other)))
            }
          />
          <Switch
            label={i18n.t('editor.data.optional', { name: field.name })}
            checked={field.optional === true}
            onCheckedChange={(optional) =>
              setFields(
                model.fields.map((other, i) => (i === index ? { ...other, optional } : other)),
              )
            }
          />
          <IconButton
            size="sm"
            label={i18n.t('editor.data.remove', { name: field.name })}
            icon={<Trash2 size={13} />}
            disabled={disabled}
            onClick={() => setFields(model.fields.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={disabled}
        onClick={() =>
          setFields([...model.fields, { name: `field${model.fields.length + 1}`, type: 'string' }])
        }
      >
        <Plus size={13} aria-hidden />
        {i18n.t('editor.data.addField')}
      </Button>
    </div>
  );
}

function GatewayCard({
  method,
  models,
  disabled,
  onRun,
}: {
  method: GatewayMethod;
  models: readonly DomainModel[];
  disabled: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const update = (patch: Parameters<typeof updateGatewayMethod>[1]) =>
    onRun(updateGatewayMethod(method.id, patch));
  return (
    <div role="group" aria-label={method.name} className={CARD}>
      <div className="flex items-center gap-1.5">
        <Select
          aria-label={i18n.t('editor.data.httpMethod', { name: method.name })}
          disabled={disabled}
          value={method.httpMethod}
          onChange={(event) =>
            update({ httpMethod: event.target.value as GatewayMethod['httpMethod'] })
          }
        >
          {HTTP_METHODS.map((verb) => (
            <option key={verb} value={verb}>
              {verb}
            </option>
          ))}
        </Select>
        <CommitInput
          mono
          label={i18n.t('editor.data.methodName')}
          value={method.name}
          disabled={disabled}
          onCommit={(name) => update({ name })}
        />
        <IconButton
          size="sm"
          label={i18n.t('editor.data.remove', { name: method.name })}
          icon={<Trash2 size={13} />}
          disabled={disabled}
          onClick={() => onRun(removeGatewayMethod(method.id))}
        />
      </div>
      <CommitInput
        mono
        label={i18n.t('editor.data.path', { name: method.name })}
        placeholder="/users/{id}"
        value={method.path}
        disabled={disabled}
        onCommit={(path) => update({ path })}
      />
      <div className="flex items-center gap-1.5">
        <Select
          aria-label={i18n.t('editor.data.input', { name: method.name })}
          disabled={disabled}
          value={method.input ?? ''}
          onChange={(event) => update({ input: event.target.value })}
        >
          <option value="">{i18n.t('editor.data.noInput')}</option>
          {models.map((model) => (
            <option key={model.id} value={model.name}>
              {model.name}
            </option>
          ))}
        </Select>
        <CommitInput
          mono
          label={i18n.t('editor.data.output', { name: method.name })}
          value={method.output}
          disabled={disabled}
          onCommit={(output) => update({ output })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms (§14.1)
// ---------------------------------------------------------------------------

const FIELD_TYPES: FormField['type'][] = ['string', 'number', 'boolean', 'date', 'email', 'select'];
const MODES = ['onSubmit', 'onBlur', 'onChange', 'onTouched', 'all'] as const;

export function FormsPanel({
  document,
  editable,
  screenId,
  onRun,
}: PanelProps & { screenId: string | undefined }) {
  const i18n = useT();
  const screen = document.screens.find((candidate) => candidate.id === screenId);
  if (!screen) {
    return (
      <EmptyState title={i18n.t('editor.forms.noScreenTitle')}>
        {i18n.t('editor.forms.noScreenBody')}
      </EmptyState>
    );
  }
  const forms = document.forms.filter((form) => form.screenId === screen.id);
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      <p className="text-2xs text-fg-subtle">
        {i18n.t('editor.forms.forScreen', { screen: screen.name })}
      </p>
      {forms.length === 0 && !editable && (
        <p className="text-sm text-fg-muted">{i18n.t('editor.forms.emptyBody')}</p>
      )}
      {forms.map((form) => (
        <FormCard
          key={form.id}
          form={form}
          document={document}
          disabled={!editable}
          onRun={onRun}
        />
      ))}
      <AddRow
        label={i18n.t('editor.forms.formName')}
        placeholder="loginForm"
        buttonLabel={i18n.t('editor.forms.add')}
        disabled={!editable}
        onAdd={(name) => onRun(addForm(screen.id, name))}
      />
    </div>
  );
}

function FormCard({
  form,
  document,
  disabled,
  onRun,
}: {
  form: Form;
  document: RnjbDocument;
  disabled: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  return (
    <div role="group" aria-label={form.name} className={CARD}>
      <div className="flex items-center gap-1.5">
        <CommitInput
          mono
          label={i18n.t('editor.forms.formName')}
          value={form.name}
          disabled={disabled}
          onCommit={(name) => onRun(renameForm(form.id, name))}
        />
        <IconButton
          size="sm"
          label={i18n.t('editor.forms.remove', { name: form.name })}
          icon={<Trash2 size={13} />}
          disabled={disabled}
          onClick={() => onRun(removeForm(form.id))}
        />
      </div>
      <div className="flex items-center gap-2">
        <Select
          aria-label={i18n.t('editor.forms.mode', { name: form.name })}
          disabled={disabled}
          value={form.mode ?? ''}
          onChange={(event) =>
            onRun(
              setFormMode(form.id, (event.target.value || undefined) as Form['mode'], form.dynamic),
            )
          }
        >
          <option value="">{i18n.t('editor.forms.modeProfile')}</option>
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </Select>
        <span className="flex items-center gap-1.5 text-xs">
          {i18n.t('editor.forms.dynamic')}
          <Switch
            label={i18n.t('editor.forms.dynamicNamed', { name: form.name })}
            checked={form.dynamic}
            onCheckedChange={(dynamic) => onRun(setFormMode(form.id, form.mode, dynamic))}
          />
        </span>
      </div>
      {form.fields.map((field) => (
        <FieldRow
          key={field.id}
          form={form}
          field={field}
          document={document}
          disabled={disabled}
          onRun={onRun}
        />
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        disabled={disabled}
        onClick={() =>
          onRun(addFormField(form.id, { name: `field${form.fields.length + 1}`, type: 'string' }))
        }
      >
        <Plus size={13} aria-hidden />
        {i18n.t('editor.forms.addField')}
      </Button>
    </div>
  );
}

const numberOrUndefined = (text: string): number | undefined => {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
};

function FieldRow({
  form,
  field,
  document,
  disabled,
  onRun,
}: {
  form: Form;
  field: FormField;
  document: RnjbDocument;
  disabled: boolean;
  onRun: (command: Command) => void;
}) {
  const i18n = useT();
  const update = (patch: Parameters<typeof updateFormField>[2]) =>
    onRun(updateFormField(form.id, field.id, patch));
  const message = (rule: string) => document.strings[field.messages[rule] ?? ''] ?? '';
  const screen = document.screens.find((candidate) => candidate.id === form.screenId);
  const components = Object.values(screen?.nodes ?? {}).flatMap((node) =>
    node.kind === 'component' ? [node] : [],
  );
  const boundNode = field.nodeId ? components.find((node) => node.id === field.nodeId) : undefined;
  const bound = boundNode !== undefined;
  const libraries = useLibraries((state) => state.packs);
  const errorProp = boundNode
    ? libraries
        .find((pack) => pack.package === boundNode.ref.package)
        ?.components.find((component) => component.name === boundNode.ref.component)?.formBinding
        ?.error
    : undefined;
  const simulated = useSimulatedErrors((state) => state.fields[field.id] === true);
  const toggleSimulated = useSimulatedErrors((state) => state.toggle);
  const rules = [
    'required',
    ...(field.min !== undefined ? ['min'] : []),
    ...(field.max !== undefined ? ['max'] : []),
    ...(field.pattern ? ['pattern'] : []),
  ];
  return (
    <div
      role="group"
      aria-label={field.name}
      className="flex flex-col gap-1.5 border-t border-line-subtle pt-2"
    >
      <div className="flex items-center gap-1.5">
        <CommitInput
          mono
          className="w-24"
          label={i18n.t('editor.forms.fieldName', { form: form.name })}
          value={field.name}
          disabled={disabled}
          onCommit={(name) => update({ name })}
        />
        <Select
          aria-label={i18n.t('editor.forms.fieldType', { name: field.name })}
          disabled={disabled}
          value={field.type}
          onChange={(event) => update({ type: event.target.value as FormField['type'] })}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
        <Switch
          label={i18n.t('editor.forms.required', { name: field.name })}
          checked={field.required}
          onCheckedChange={(required) => update({ required })}
        />
        <IconButton
          size="sm"
          label={i18n.t('editor.forms.remove', { name: field.name })}
          icon={<Trash2 size={13} />}
          disabled={disabled}
          onClick={() => onRun(removeFormField(form.id, field.id))}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <CommitInput
          label={i18n.t('editor.forms.min', { name: field.name })}
          placeholder="min"
          value={field.min === undefined ? '' : String(field.min)}
          disabled={disabled}
          onCommit={(text) => update({ min: numberOrUndefined(text) })}
        />
        <CommitInput
          label={i18n.t('editor.forms.max', { name: field.name })}
          placeholder="max"
          value={field.max === undefined ? '' : String(field.max)}
          disabled={disabled}
          onCommit={(text) => update({ max: numberOrUndefined(text) })}
        />
        <CommitInput
          mono
          label={i18n.t('editor.forms.pattern', { name: field.name })}
          placeholder="regex"
          value={field.pattern ?? ''}
          disabled={disabled}
          onCommit={(pattern) => update({ pattern })}
        />
        <CommitInput
          label={i18n.t('editor.forms.defaultValue', { name: field.name })}
          placeholder={i18n.t('editor.forms.defaultPlaceholder')}
          value={field.defaultValue === undefined ? '' : String(field.defaultValue)}
          disabled={disabled}
          onCommit={(text) => update({ defaultValue: text === '' ? undefined : text })}
        />
      </div>
      {rules.map((rule) => (
        <CommitInput
          key={rule}
          label={i18n.t('editor.forms.message', { name: field.name, rule })}
          placeholder={i18n.t('editor.forms.messagePlaceholder', { rule })}
          value={message(rule)}
          disabled={disabled}
          onCommit={(text) => onRun(setFieldMessage(form.id, field.id, rule, text))}
        />
      ))}
      <Select
        aria-label={i18n.t('editor.forms.component', { name: field.name })}
        disabled={disabled}
        value={bound ? field.nodeId : ''}
        onChange={(event) => update({ nodeId: event.target.value || undefined })}
      >
        <option value="">{i18n.t('editor.forms.noComponent')}</option>
        {components.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name ?? node.ref.component}
          </option>
        ))}
      </Select>
      {bound && !errorProp && (
        <p className="text-2xs text-fg-subtle">{i18n.t('editor.forms.noErrorProp')}</p>
      )}
      <span className="flex items-center justify-between gap-2 text-xs">
        {i18n.t('editor.forms.simulate')}
        <Switch
          label={i18n.t('editor.forms.simulateNamed', { name: field.name })}
          checked={simulated}
          onCheckedChange={(on) => toggleSimulated(field.id, on)}
        />
      </span>
    </div>
  );
}
