import type {
  Asset,
  Board,
  Category,
  CodeBlock,
  ComponentRef,
  Connection,
  DocumentData,
  DocumentMeta,
  DocumentNode,
  Form,
  HookUsage,
  JsonValue,
  Layout,
  LibraryRef,
  ProfileRef,
  PropValue,
  Provenance,
  RnjbDocument,
  Screen,
  ScreenState,
  Spacing,
  SpacingValue,
} from '@rnjb/core';
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from '@rnjb/core';
import { z } from 'zod';

/** Current `.rnjb` format version written by this platform. */
export const FORMAT_VERSION = 1;

const id = z.string().min(1).max(128);
const isoDate = z.iso.datetime({ offset: true });
const semverish = z.string().min(1).max(64);

const json: z.ZodType<JsonValue> = z.json();

export const profileRefSchema: z.ZodType<ProfileRef> = z.strictObject({
  id,
  version: semverish,
});

export const libraryRefSchema: z.ZodType<LibraryRef> = z.strictObject({
  package: z.string().min(1).max(214),
  version: semverish,
  packId: id,
});

export const metaSchema: z.ZodType<DocumentMeta> = z.strictObject({
  kind: z.enum(['journey', 'template']),
  name: z.string().min(1).max(120),
  slug: z.string().min(SLUG_MIN_LENGTH).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN),
  description: z.string().max(2000).optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  platformVersion: semverish,
});

export const componentRefSchema: z.ZodType<ComponentRef> = z.strictObject({
  package: z.string().min(1),
  component: z.string().min(1),
  version: semverish,
  variant: z.string().min(1).optional(),
});

export const propValueSchema: z.ZodType<PropValue> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.strictObject({ type: z.literal('string'), key: z.string().min(1) }),
  z.strictObject({ type: z.literal('token'), group: z.string().min(1), name: z.string().min(1) }),
  z.strictObject({ type: z.literal('icon'), name: z.string().min(1) }),
  z.strictObject({
    type: z.literal('binding'),
    source: z.enum(['uiState', 'form', 'handler', 'param']),
    path: z.string().min(1),
  }),
  z.strictObject({ type: z.literal('expression'), code: z.string() }),
]);

const spacingValue: z.ZodType<SpacingValue> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('literal'), value: z.number() }),
  z.strictObject({ type: z.literal('token'), group: z.string().min(1), name: z.string().min(1) }),
]);

const sides = z
  .strictObject({
    top: spacingValue.optional(),
    right: spacingValue.optional(),
    bottom: spacingValue.optional(),
    left: spacingValue.optional(),
  })
  .optional();

export const spacingSchema: z.ZodType<Spacing> = z.strictObject({
  margin: sides,
  padding: sides,
  gap: spacingValue.optional(),
});

const dimension = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?%$|^auto$/)]);

export const layoutSchema: z.ZodType<Layout> = z.strictObject({
  flexDirection: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
  justifyContent: z
    .enum(['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'])
    .optional(),
  alignItems: z.enum(['flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional(),
  alignSelf: z.enum(['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline']).optional(),
  flexWrap: z.enum(['wrap', 'nowrap', 'wrap-reverse']).optional(),
  flex: z.number().optional(),
  flexGrow: z.number().min(0).optional(),
  flexShrink: z.number().min(0).optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  position: z.enum(['relative', 'absolute']).optional(),
});

/** Paths are relative to the journey `assets/` folder and can never escape it (§6.6). */
export const relativeAssetPath = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !/^[A-Za-z]:/.test(value) &&
      !value.includes('\0') &&
      value.split('/').every((segment) => segment !== '..' && segment !== '' && segment !== '.'),
    { message: 'RNJB-206' },
  );

export const codeBlockSchema: z.ZodType<CodeBlock> = z.strictObject({
  language: z.enum(['ts', 'tsx']),
  source: z.string(),
  imports: z.array(z.string()),
  origin: z
    .strictObject({
      file: z.string().min(1),
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    })
    .optional(),
});

export const nodeSchema: z.ZodType<DocumentNode> = z.discriminatedUnion('kind', [
  z.strictObject({
    id,
    kind: z.literal('component'),
    name: z.string().optional(),
    ref: componentRefSchema,
    props: z.record(z.string(), propValueSchema),
    children: z.array(id),
    layout: layoutSchema,
    spacing: spacingSchema,
  }),
  z.strictObject({
    id,
    kind: z.literal('code'),
    name: z.string().optional(),
    code: codeBlockSchema,
    children: z.array(id),
  }),
]);

const stateSchema: z.ZodType<ScreenState> = z.strictObject({
  id,
  name: z.string().min(1),
  sample: z.record(z.string(), json),
});

const hookUsageSchema: z.ZodType<HookUsage> = z.strictObject({
  id,
  hook: z.string().min(1),
  library: z.string().min(1),
  version: semverish,
  bindings: z.record(z.string(), z.string()),
  dependencies: z.array(z.string()),
  body: codeBlockSchema.optional(),
});

export const screenSchema: z.ZodType<Screen> = z
  .strictObject({
    id,
    name: z.string().min(1).max(120),
    rootId: id,
    nodes: z.record(id, nodeSchema),
    states: z.array(stateSchema),
    logic: z.strictObject({ hooks: z.array(hookUsageSchema), blocks: z.array(codeBlockSchema) }),
  })
  .superRefine((screen, ctx) => {
    if (!screen.nodes[screen.rootId]) {
      ctx.addIssue({ code: 'custom', path: ['rootId'], message: 'RNJB-601' });
    }
    for (const [key, node] of Object.entries(screen.nodes)) {
      if (node.id !== key)
        ctx.addIssue({ code: 'custom', path: ['nodes', key, 'id'], message: 'id ≠ key' });
      node.children.forEach((child, index) => {
        if (!screen.nodes[child]) {
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', key, 'children', index],
            message: 'RNJB-601',
          });
        }
      });
    }
  });

const typedParam = z.strictObject({
  name: z.string().min(1),
  type: z.string().min(1),
  optional: z.boolean().optional(),
});

const connectionSchema: z.ZodType<Connection> = z.strictObject({
  id,
  fromScreenId: id,
  triggerNodeId: id.optional(),
  toScreenId: id,
  params: z.array(typedParam),
});

const formSchema: z.ZodType<Form> = z.strictObject({
  id,
  screenId: id,
  name: z.string().min(1),
  mode: z.enum(['onSubmit', 'onBlur', 'onChange', 'onTouched', 'all']).optional(),
  dynamic: z.boolean(),
  fields: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      type: z.enum(['string', 'number', 'boolean', 'date', 'email', 'select']),
      required: z.boolean(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      messages: z.record(z.string(), z.string()),
      defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      nodeId: id.optional(),
    }),
  ),
});

const dataSchema: z.ZodType<DocumentData> = z.strictObject({
  models: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      fields: z.array(typedParam),
    }),
  ),
  gateways: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      input: z.string().optional(),
      output: z.string().min(1),
      httpMethod: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string().min(1),
      body: codeBlockSchema.optional(),
    }),
  ),
  blocks: z.array(codeBlockSchema),
});

const assetSchema: z.ZodType<Asset> = z.strictObject({
  id,
  path: relativeAssetPath,
  mimeType: z.string().optional(),
});

const categorySchema: z.ZodType<Category> = z.strictObject({
  id,
  name: z.string().min(1),
  parentId: id.optional(),
});

const boardSchema: z.ZodType<Board> = z.strictObject({
  initialScreenId: id.optional(),
  positions: z.record(id, z.strictObject({ x: z.number(), y: z.number() })),
});

const provenanceSchema: z.ZodType<Provenance> = z.strictObject({
  importedFrom: z
    .strictObject({
      repository: z.string().min(1),
      commit: z.string().min(1),
      profile: profileRefSchema,
    })
    .optional(),
  remote: z
    .strictObject({
      remote: z.string().min(1),
      ref: z.string().min(1),
      path: z.string().min(1),
      commit: z.string().min(1),
      base: z.string().min(1).optional(),
    })
    .optional(),
});

export const documentSchema: z.ZodType<RnjbDocument> = z
  .strictObject({
    format: z.literal('rnjb'),
    formatVersion: z.number().int().positive(),
    meta: metaSchema,
    libraries: z.array(libraryRefSchema),
    profile: profileRefSchema,
    screens: z.array(screenSchema),
    connections: z.array(connectionSchema),
    forms: z.array(formSchema),
    data: dataSchema,
    strings: z.record(z.string(), z.string()),
    assets: z.array(assetSchema),
    categories: z.array(categorySchema),
    board: boardSchema,
    provenance: provenanceSchema.optional(),
    integrity: z.string(),
  })
  .superRefine((document, ctx) => {
    const screenIds = new Set(document.screens.map((screen) => screen.id));
    document.connections.forEach((connection, index) => {
      for (const key of ['fromScreenId', 'toScreenId'] as const) {
        if (!screenIds.has(connection[key])) {
          ctx.addIssue({ code: 'custom', path: ['connections', index, key], message: 'RNJB-602' });
        }
      }
    });
    if (document.board.initialScreenId && !screenIds.has(document.board.initialScreenId)) {
      ctx.addIssue({ code: 'custom', path: ['board', 'initialScreenId'], message: 'RNJB-602' });
    }
  });

/** Minimal envelope read before migrating, so newer files are detected without full validation. */
export const envelopeSchema = z.object({
  format: z.literal('rnjb'),
  formatVersion: z.number().int().positive(),
});
