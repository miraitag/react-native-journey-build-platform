import { describe, expect, it } from 'vitest';
import { addScreen, applyCommand, createDocument, type CommandContext } from './commands.ts';
import {
  addForm,
  addFormField,
  addGatewayMethod,
  addModel,
  removeForm,
  removeModel,
  renameForm,
  renameModel,
  setFieldMessage,
  setModelFields,
  updateFormField,
  updateGatewayMethod,
} from './forms-data.ts';
import { RnjbError } from './errors.ts';

function setup() {
  let n = 0;
  const ctx: CommandContext = {
    ids: { next: () => `id${++n}` },
    clock: { now: () => '2026-01-01T00:00:00.000Z' },
  };
  let screenId = '';
  let doc = createDocument(
    {
      kind: 'journey',
      name: 'T',
      slug: 'tst',
      profile: { id: 'p', version: '1.0.0' },
      libraries: [],
      platformVersion: '0.0.0-test',
      formatVersion: 1,
    },
    ctx.clock,
  );
  doc = applyCommand(
    doc,
    addScreen(
      { name: 'A', root: { package: 'react-native', component: 'View', version: '*' } },
      (id) => (screenId = id),
    ),
    ctx,
  ).document;
  return { ctx, doc, screenId };
}

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof RnjbError ? error.code : 'other';
  }
  return 'none';
};

describe('forms', () => {
  it('adds a form with fields, validates names and keeps messages in strings', () => {
    const { ctx, doc, screenId } = setup();
    let formId = '';
    let fieldId = '';
    let next = applyCommand(
      doc,
      addForm(screenId, 'login', (id) => (formId = id)),
      ctx,
    ).document;
    next = applyCommand(
      next,
      addFormField(
        formId,
        { name: 'email', type: 'email', required: true },
        (id) => (fieldId = id),
      ),
      ctx,
    ).document;
    next = applyCommand(
      next,
      updateFormField(formId, fieldId, { min: 3, pattern: '^a' }),
      ctx,
    ).document;
    next = applyCommand(
      next,
      setFieldMessage(formId, fieldId, 'required', 'Obligatorio'),
      ctx,
    ).document;

    const field = next.forms[0]?.fields[0];
    expect(field).toMatchObject({ name: 'email', required: true, min: 3, pattern: '^a' });
    expect(field?.messages.required).toBe('forms.login.email.required');
    expect(next.strings['forms.login.email.required']).toBe('Obligatorio');

    next = applyCommand(next, setFieldMessage(formId, fieldId, 'required', ''), ctx).document;
    expect(next.strings['forms.login.email.required']).toBeUndefined();
    next = applyCommand(next, updateFormField(formId, fieldId, { min: undefined }), ctx).document;
    expect(next.forms[0]?.fields[0]?.min).toBeUndefined();

    expect(codeOf(() => applyCommand(next, addForm(screenId, 'login'), ctx))).toBe('RNJB-609');
    expect(
      codeOf(() =>
        applyCommand(next, addFormField(formId, { name: 'email', type: 'string' }), ctx),
      ),
    ).toBe('RNJB-609');
    expect(
      codeOf(() => applyCommand(next, updateFormField(formId, fieldId, { pattern: '(' }), ctx)),
    ).toBe('RNJB-609');
    expect(codeOf(() => applyCommand(next, addForm('nope', 'other'), ctx))).toBe('RNJB-602');
    expect(codeOf(() => applyCommand(next, renameForm('nope', 'x'), ctx))).toBe('RNJB-608');

    next = applyCommand(next, renameForm(formId, 'signIn'), ctx).document;
    expect(next.forms[0]?.name).toBe('signIn');
    next = applyCommand(next, removeForm(formId), ctx).document;
    expect(next.forms).toEqual([]);
  });
});

describe('data', () => {
  it('keeps gateways in step with model renames and removals', () => {
    const { ctx, doc } = setup();
    let modelId = '';
    let methodId = '';
    let next = applyCommand(
      doc,
      addModel('UserModel', (id) => (modelId = id)),
      ctx,
    ).document;
    next = applyCommand(
      next,
      setModelFields(modelId, [
        { name: 'id', type: 'string' },
        { name: 'age', type: 'number', optional: true },
      ]),
      ctx,
    ).document;
    next = applyCommand(
      next,
      addGatewayMethod(
        {
          name: 'getUser',
          input: 'UserModel',
          output: 'UserModel',
          httpMethod: 'GET',
          path: '/users/{id}',
        },
        (id) => (methodId = id),
      ),
      ctx,
    ).document;

    next = applyCommand(next, renameModel(modelId, 'Account'), ctx).document;
    expect(next.data.gateways[0]).toMatchObject({ input: 'Account', output: 'Account' });
    expect(next.data.models[0]?.fields[1]).toEqual({ name: 'age', type: 'number', optional: true });

    next = applyCommand(
      next,
      updateGatewayMethod(methodId, { httpMethod: 'POST', input: undefined }),
      ctx,
    ).document;
    expect(next.data.gateways[0]?.httpMethod).toBe('POST');
    expect(next.data.gateways[0]?.input).toBeUndefined();

    next = applyCommand(next, removeModel(modelId), ctx).document;
    expect(next.data.models).toEqual([]);

    expect(codeOf(() => applyCommand(doc, addModel('1bad'), ctx))).toBe('RNJB-609');
    expect(codeOf(() => applyCommand(next, renameModel('nope', 'X'), ctx))).toBe('RNJB-608');
    expect(codeOf(() => applyCommand(next, setModelFields('nope', []), ctx))).toBe('RNJB-608');
  });

  it('rejects duplicated model fields', () => {
    const { ctx, doc } = setup();
    let modelId = '';
    const next = applyCommand(
      doc,
      addModel('M', (id) => (modelId = id)),
      ctx,
    ).document;
    expect(
      codeOf(() =>
        applyCommand(
          next,
          setModelFields(modelId, [
            { name: 'a', type: 'string' },
            { name: 'a', type: 'string' },
          ]),
          ctx,
        ),
      ),
    ).toBe('RNJB-609');
  });
});
