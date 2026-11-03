import type { Draft } from 'immer';
import type { Command } from './commands.ts';
import type {
  DomainModel,
  DomainModelField,
  Form,
  FormField,
  GatewayMethod,
  RnjbDocument,
} from './entities.ts';
import { RnjbError } from './errors.ts';

/** Identifier shared by forms, fields, models and gateway methods: it becomes a TS symbol. */
export const DATA_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

const checkName = (name: string, others: readonly string[], kind: string): void => {
  if (!DATA_NAME.test(name) || others.includes(name))
    throw new RnjbError('RNJB-609', { kind, name });
};

const missing = (kind: string, id: string): RnjbError => new RnjbError('RNJB-608', { kind, id });

function formOf(draft: Draft<RnjbDocument>, formId: string): Draft<Form> {
  const form = draft.forms.find((candidate) => candidate.id === formId);
  if (!form) throw missing('form', formId);
  return form;
}

function fieldOf(form: Draft<Form>, fieldId: string): Draft<FormField> {
  const field = form.fields.find((candidate) => candidate.id === fieldId);
  if (!field) throw missing('field', fieldId);
  return field;
}

function modelOf(draft: Draft<RnjbDocument>, modelId: string): Draft<DomainModel> {
  const model = draft.data.models.find((candidate) => candidate.id === modelId);
  if (!model) throw missing('model', modelId);
  return model;
}

function methodOf(draft: Draft<RnjbDocument>, methodId: string): Draft<GatewayMethod> {
  const method = draft.data.gateways.find((candidate) => candidate.id === methodId);
  if (!method) throw missing('gateway', methodId);
  return method;
}

// ---------------------------------------------------------------------------
// Forms (§14.1)
// ---------------------------------------------------------------------------

export const addForm =
  (screenId: string, name: string, onCreated?: (formId: string) => void): Command =>
  (draft, { ids }) => {
    if (!draft.screens.some((screen) => screen.id === screenId)) {
      throw new RnjbError('RNJB-602', { screenId });
    }
    checkName(
      name,
      draft.forms.map((form) => form.name),
      'form',
    );
    const id = ids.next();
    draft.forms.push({ id, screenId, name, dynamic: false, fields: [] });
    onCreated?.(id);
  };

export const renameForm =
  (formId: string, name: string): Command =>
  (draft) => {
    const form = formOf(draft, formId);
    checkName(
      name,
      draft.forms.filter((other) => other.id !== formId).map((other) => other.name),
      'form',
    );
    form.name = name;
  };

export const removeForm =
  (formId: string): Command =>
  (draft) => {
    formOf(draft, formId);
    draft.forms = draft.forms.filter((form) => form.id !== formId);
  };

export const setFormMode =
  (formId: string, mode: Form['mode'], dynamic: boolean): Command =>
  (draft) => {
    const form = formOf(draft, formId);
    if (mode === undefined) delete form.mode;
    else form.mode = mode;
    form.dynamic = dynamic;
  };

export interface NewFormField {
  name: string;
  type: FormField['type'];
  required?: boolean;
}

export const addFormField =
  (formId: string, input: NewFormField, onCreated?: (fieldId: string) => void): Command =>
  (draft, { ids }) => {
    const form = formOf(draft, formId);
    checkName(
      input.name,
      form.fields.map((field) => field.name),
      'field',
    );
    const id = ids.next();
    form.fields.push({
      id,
      name: input.name,
      type: input.type,
      required: input.required ?? false,
      messages: {},
    });
    onCreated?.(id);
  };

export type FormFieldPatch = Partial<
  Pick<FormField, 'type' | 'required' | 'min' | 'max' | 'pattern' | 'defaultValue' | 'nodeId'>
> & { name?: string };

/** `undefined` values clear the optional attribute; `name` is checked for uniqueness. */
export const updateFormField =
  (formId: string, fieldId: string, patch: FormFieldPatch): Command =>
  (draft) => {
    const form = formOf(draft, formId);
    const field = fieldOf(form, fieldId);
    if (patch.name !== undefined) {
      checkName(
        patch.name,
        form.fields.filter((other) => other.id !== fieldId).map((other) => other.name),
        'field',
      );
      field.name = patch.name;
    }
    if (patch.pattern !== undefined && patch.pattern !== '') {
      try {
        new RegExp(patch.pattern);
      } catch {
        throw new RnjbError('RNJB-609', { kind: 'pattern', name: patch.pattern });
      }
    }
    for (const key of ['min', 'max', 'pattern', 'defaultValue', 'nodeId'] as const) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined || value === '') delete field[key];
      else (field as Record<string, unknown>)[key] = value;
    }
    if (patch.type !== undefined) field.type = patch.type;
    if (patch.required !== undefined) field.required = patch.required;
  };

export const removeFormField =
  (formId: string, fieldId: string): Command =>
  (draft) => {
    const form = formOf(draft, formId);
    fieldOf(form, fieldId);
    form.fields = form.fields.filter((field) => field.id !== fieldId);
  };

/**
 * Error messages live in the journey `strings` (§14.1): the field keeps the key, the text is
 * stored under it. An empty text removes both.
 */
export const setFieldMessage =
  (formId: string, fieldId: string, rule: string, text: string): Command =>
  (draft) => {
    const form = formOf(draft, formId);
    const field = fieldOf(form, fieldId);
    const key = `forms.${form.name}.${field.name}.${rule}`;
    if (text === '') {
      delete field.messages[rule];
      delete draft.strings[key];
      return;
    }
    field.messages[rule] = key;
    draft.strings[key] = text;
  };

// ---------------------------------------------------------------------------
// Data (§14.3)
// ---------------------------------------------------------------------------

export const addModel =
  (name: string, onCreated?: (modelId: string) => void): Command =>
  (draft, { ids }) => {
    checkName(
      name,
      draft.data.models.map((model) => model.name),
      'model',
    );
    const id = ids.next();
    draft.data.models.push({ id, name, fields: [] });
    onCreated?.(id);
  };

export const renameModel =
  (modelId: string, name: string): Command =>
  (draft) => {
    const model = modelOf(draft, modelId);
    checkName(
      name,
      draft.data.models.filter((other) => other.id !== modelId).map((other) => other.name),
      'model',
    );
    const previous = model.name;
    model.name = name;
    // Gateways refer to models by name.
    for (const method of draft.data.gateways) {
      if (method.input === previous) method.input = name;
      if (method.output === previous) method.output = name;
    }
  };

export const removeModel =
  (modelId: string): Command =>
  (draft) => {
    const model = modelOf(draft, modelId);
    draft.data.models = draft.data.models.filter((other) => other.id !== modelId);
    for (const method of draft.data.gateways) {
      if (method.input === model.name) delete method.input;
    }
  };

export const setModelFields =
  (modelId: string, fields: readonly DomainModelField[]): Command =>
  (draft) => {
    const model = modelOf(draft, modelId);
    const seen: string[] = [];
    for (const field of fields) {
      checkName(field.name, seen, 'field');
      if (field.type.trim() === '') throw new RnjbError('RNJB-609', { kind: 'type', name: '' });
      seen.push(field.name);
    }
    model.fields = fields.map((field) => ({
      name: field.name,
      type: field.type.trim(),
      ...(field.optional ? { optional: true } : {}),
    }));
  };

export interface NewGatewayMethod {
  name: string;
  output: string;
  httpMethod: GatewayMethod['httpMethod'];
  path: string;
  input?: string;
}

export const addGatewayMethod =
  (input: NewGatewayMethod, onCreated?: (methodId: string) => void): Command =>
  (draft, { ids }) => {
    checkName(
      input.name,
      draft.data.gateways.map((method) => method.name),
      'gateway',
    );
    if (input.output.trim() === '') throw new RnjbError('RNJB-609', { kind: 'output', name: '' });
    const id = ids.next();
    draft.data.gateways.push({
      id,
      name: input.name,
      output: input.output.trim(),
      httpMethod: input.httpMethod,
      path: input.path.trim(),
      ...(input.input ? { input: input.input } : {}),
    });
    onCreated?.(id);
  };

export type GatewayMethodPatch = Partial<Omit<GatewayMethod, 'id' | 'body'>>;

export const updateGatewayMethod =
  (methodId: string, patch: GatewayMethodPatch): Command =>
  (draft) => {
    const method = methodOf(draft, methodId);
    if (patch.name !== undefined) {
      checkName(
        patch.name,
        draft.data.gateways.filter((other) => other.id !== methodId).map((other) => other.name),
        'gateway',
      );
      method.name = patch.name;
    }
    if (patch.output !== undefined) {
      if (patch.output.trim() === '') throw new RnjbError('RNJB-609', { kind: 'output', name: '' });
      method.output = patch.output.trim();
    }
    if (patch.httpMethod !== undefined) method.httpMethod = patch.httpMethod;
    if (patch.path !== undefined) method.path = patch.path.trim();
    if ('input' in patch) {
      if (!patch.input) delete method.input;
      else method.input = patch.input;
    }
  };

export const removeGatewayMethod =
  (methodId: string): Command =>
  (draft) => {
    methodOf(draft, methodId);
    draft.data.gateways = draft.data.gateways.filter((method) => method.id !== methodId);
  };
