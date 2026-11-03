import { z } from 'zod';

/**
 * Typed message protocol between the editor and the preview iframe (ADR 0005). Both sides parse
 * every incoming message: the iframe has an opaque origin, so the shape is the only contract.
 */

const display = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const sceneNodeSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(['component', 'code']),
  /** Component name, or the label of a code block. */
  label: z.string(),
  /** Which library component a node is, so the frame can render the real one when loaded. */
  ref: z.strictObject({ package: z.string(), component: z.string() }).optional(),
  /** Props already resolved to display values; bindings and expressions are never evaluated. */
  props: z.record(z.string(), display),
  /** Layout and spacing as plain numeric/keyword style, validated while the scene is built. */
  style: z.record(z.string(), z.union([z.string(), z.number()])),
  children: z.array(z.string()),
});

export const sceneSchema = z.strictObject({
  screenId: z.string(),
  rootId: z.string(),
  nodes: z.record(z.string(), sceneNodeSchema),
});

const rectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const hostMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rnjb:library'),
    package: z.string().min(1),
    key: z.string().min(1),
    /** Global the compiled script assigns its exports to; never an arbitrary expression. */
    globalName: z.string().regex(/^RnjbLib_[A-Za-z0-9_]+$/),
    code: z.string(),
  }),
  z.strictObject({
    type: z.literal('rnjb:render'),
    scene: sceneSchema,
    size: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
    theme: z.enum(['light', 'dark']),
  }),
]);

export const frameMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('rnjb:ready') }),
  z.strictObject({
    type: z.literal('rnjb:rects'),
    screenId: z.string(),
    rects: z.record(z.string(), rectSchema),
  }),
  z.strictObject({ type: z.literal('rnjb:error'), message: z.string() }),
  z.strictObject({ type: z.literal('rnjb:library-loaded'), key: z.string() }),
  z.strictObject({ type: z.literal('rnjb:library-failed'), key: z.string(), message: z.string() }),
]);

export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type NodeRect = z.infer<typeof rectSchema>;
export type HostMessage = z.infer<typeof hostMessageSchema>;
export type FrameMessage = z.infer<typeof frameMessageSchema>;
