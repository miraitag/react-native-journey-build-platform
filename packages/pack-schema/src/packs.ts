import { codeBlockSchema, nodeSchema } from '@rnjb/document-schema';
import { z } from 'zod';

export const PACK_SCHEMA_VERSION = 1;

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'kebab/dot id')
  .max(128);
const origin = z.enum(['extracted', 'curated']);
const layer = z.enum(['presentation', 'domain', 'data']);

const packBase = {
  schemaVersion: z.literal(PACK_SCHEMA_VERSION),
  id,
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
};

// ---------------------------------------------------------------------------
// Library pack (§7.3)
// ---------------------------------------------------------------------------

export const propManifestSchema = z.strictObject({
  name: z.string().min(1),
  /** Type text as written in the library, e.g. `'primary' | 'secondary'`. */
  type: z.string(),
  kind: z.enum(['boolean', 'string', 'number', 'enum', 'node', 'function', 'object', 'unknown']),
  options: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  optional: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  origin,
});

export const componentManifestSchema = z.strictObject({
  name: z.string().min(1),
  category: z.string().optional(),
  origin,
  props: z.array(propManifestSchema),
  /** Prop names whose literal unions generate variants. */
  variantProps: z.array(z.string()).optional(),
  nesting: z
    .strictObject({
      acceptsChildren: z.boolean(),
      allowedChildren: z.array(z.string()).optional(),
      allowedParents: z.array(z.string()).optional(),
    })
    .optional(),
  formBinding: z
    .strictObject({
      value: z.string().optional(),
      onChange: z.string().optional(),
      onBlur: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  editableTextProps: z.array(z.string()).optional(),
  iconProps: z.array(z.string()).optional(),
  supportsAbsolutePosition: z.boolean().optional(),
});

const tokenGroup = z.record(z.string(), z.union([z.string(), z.number()]));

export const libraryPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('library'),
  package: z.string().min(1),
  /** Version the manifest was extracted from. */
  packageVersion: z.string().min(1),
  importTemplate: z.string().min(1).optional(),
  components: z.array(componentManifestSchema),
  icons: z
    .strictObject({
      component: z.string().min(1),
      nameProp: z.string().min(1),
      names: z.array(z.string()),
    })
    .optional(),
  theme: z
    .strictObject({
      provider: z.string().min(1),
      schemes: z.array(z.string()),
      variants: z.array(z.string()).optional(),
    })
    .optional(),
  tokens: z
    .strictObject({
      colors: tokenGroup.optional(),
      typography: z.record(z.string(), tokenGroup).optional(),
      spacing: z.array(z.number()).optional(),
    })
    .optional(),
  shims: z.array(z.string()).optional(),
  categories: z
    .array(z.strictObject({ id, name: z.string().min(1), parentId: id.optional() }))
    .optional(),
});

// ---------------------------------------------------------------------------
// Hooks pack (§7.5)
// ---------------------------------------------------------------------------

export const hooksPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('hooks'),
  hooks: z.array(
    z.strictObject({
      name: z.string().regex(/^use[A-Z0-9]/),
      importPath: z.string().min(1),
      library: z.string().min(1),
      signature: z.string().min(1),
      isEffect: z.boolean(),
      allowedLayers: z.array(layer).min(1),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Devices pack (§12). Data comes from manufacturer specs; never estimated.
// ---------------------------------------------------------------------------

const insets = z.strictObject({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
});

const size = z.strictObject({ width: z.number().positive(), height: z.number().positive() });

const rect = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
/** A fold on a flexible screen hides no pixels: zero wide, as Jetpack WindowManager reports it. */
const fold = rect.extend({ width: z.number().min(0), height: z.number().min(0) });

export const chromeStyleSchema = z.strictObject({
  id,
  platform: z.enum(['ios', 'android']),
  minOsVersion: z.string().min(1),
  maxOsVersion: z.string().min(1).optional(),
  /** Free-form style family, e.g. "liquid-glass" or "material-3-expressive"; rendering reads tokens. */
  family: z.string().min(1),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const deviceSchema = z.strictObject({
  id,
  name: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  osVersions: z.array(z.string().min(1)).min(1),
  defaultOsVersion: z.string().min(1),
  logicalSize: size,
  density: z.number().positive(),
  cornerRadius: z.number().min(0),
  cutouts: z.array(
    z.strictObject({ kind: z.enum(['notch', 'dynamic-island', 'punch-hole']), rect }),
  ),
  safeArea: z.strictObject({ portrait: insets, landscape: insets }),
  statusBarHeight: z.number().min(0),
  bottomChrome: z.enum(['home-indicator', 'gesture-bar', 'three-button']),
  postures: z
    .array(
      z.strictObject({
        id,
        name: z.string().min(1),
        logicalSize: size,
        segments: z.array(rect).min(1),
        hinge: fold.optional(),
      }),
    )
    .optional(),
  /** Absent means the values were not checked against a manufacturer source yet. */
  specSource: z.url().optional(),
  reviewedAt: z.iso.date().optional(),
});

export const devicesPackSchema = z
  .strictObject({
    ...packBase,
    kind: z.literal('devices'),
    usageSource: z
      .strictObject({
        provider: z.string().min(1),
        url: z.url(),
        cutoffDate: z.iso.date(),
      })
      .optional(),
    devices: z.array(deviceSchema),
    chromeStyles: z.array(chromeStyleSchema),
  })
  .superRefine((pack, ctx) => {
    pack.devices.forEach((device, index) => {
      if (!device.osVersions.includes(device.defaultOsVersion)) {
        ctx.addIssue({
          code: 'custom',
          path: ['devices', index, 'defaultOsVersion'],
          message: 'not in osVersions',
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// Blocks pack (§7.5)
// ---------------------------------------------------------------------------

export const blocksPackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('blocks'),
  blocks: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      rootId: z.string().min(1),
      nodes: z.record(z.string(), nodeSchema),
      requires: z
        .array(z.strictObject({ package: z.string().min(1), component: z.string().min(1) }))
        .optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Profile pack (§15)
// ---------------------------------------------------------------------------

const dependencyMap = z.record(z.string(), z.string());

export const profilePackSchema = z.strictObject({
  ...packBase,
  kind: z.literal('profile'),
  conventions: z.strictObject({
    folders: z.record(z.string(), z.string()),
    fileSuffixes: z.record(z.string(), z.string()),
    fileNameCase: z.enum(['kebab', 'camel', 'pascal', 'dot']),
    nameTemplates: z.record(z.string(), z.string()),
    valuesLocation: z.string().min(1),
    formPattern: z.string().min(1),
    validationMode: z.enum(['onSubmit', 'onBlur', 'onChange', 'onTouched', 'all']),
    initialStates: z.array(z.string().min(1)),
    packageJson: z.strictObject({
      library: z.strictObject({
        dependencies: dependencyMap,
        devDependencies: dependencyMap,
        peerDependencies: dependencyMap,
        /** `packageManager` of the exported package.json, e.g. `pnpm@11.2.2`. */
        packageManager: z
          .string()
          .regex(/^[a-z]+@\d/)
          .optional(),
        /** Lines of the exported `.npmrc` (project scope only). */
        npmrc: z.array(z.string()).optional(),
      }),
      example: z.strictObject({
        dependencies: dependencyMap,
        devDependencies: dependencyMap.optional(),
      }),
    }),
    decomposition: z
      .strictObject({
        maxLines: z.number().int().positive(),
        maxNodes: z.number().int().positive(),
      })
      .optional(),
    checks: z.array(
      z.strictObject({
        id,
        /**
         * `{skills}` stands for the folder where the team skills are installed (§6.2); one `*` folder
         * picks the installed skill by kind, e.g. `{skills}/` + `*architecture*` + `/scripts/scan.mjs`.
         */
        command: z.array(z.string().min(1)).min(1),
        description: z.string().optional(),
        /** For reports that always exit 0: this pattern in the output means the check failed. */
        failsWhen: z.string().optional(),
      }),
    ),
  }),
  codecs: z.array(z.string().min(1)),
  detection: z
    .strictObject({ threshold: z.number().min(0).max(1), markers: z.array(z.string()) })
    .optional(),
  templates: z.record(z.string(), codeBlockSchema).optional(),
});

export const packSchema = z.discriminatedUnion('kind', [
  libraryPackSchema,
  hooksPackSchema,
  devicesPackSchema,
  blocksPackSchema,
  profilePackSchema,
]);

export type LibraryPack = z.infer<typeof libraryPackSchema>;
export type HooksPack = z.infer<typeof hooksPackSchema>;
export type DevicesPack = z.infer<typeof devicesPackSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type BlocksPack = z.infer<typeof blocksPackSchema>;
export type ProfilePack = z.infer<typeof profilePackSchema>;
export type Pack = z.infer<typeof packSchema>;
export type PackKind = Pack['kind'];
export type ComponentManifest = z.infer<typeof componentManifestSchema>;
export type PropManifest = z.infer<typeof propManifestSchema>;
