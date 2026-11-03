import { hasCredentials } from '@rnjb/core';
import { z } from 'zod';

export const TEAM_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// rnjb.team.json — shareable, no machine paths (§6.1)
// ---------------------------------------------------------------------------

export const teamConfigSchema = z.strictObject({
  schemaVersion: z.literal(TEAM_SCHEMA_VERSION),
  activePacks: z.array(z.string().min(1)),
  libraries: z.array(z.strictObject({ package: z.string().min(1), range: z.string().min(1) })),
  defaultProfile: z.string().min(1).optional(),
  dependencyTemplate: z
    .strictObject({
      library: z.strictObject({
        dependencies: z.record(z.string(), z.string()),
        devDependencies: z.record(z.string(), z.string()),
        peerDependencies: z.record(z.string(), z.string()),
      }),
      example: z.strictObject({ dependencies: z.record(z.string(), z.string()) }),
    })
    .optional(),
  checks: z.array(z.string().min(1)).optional(),
});

export type TeamConfig = z.infer<typeof teamConfigSchema>;

// ---------------------------------------------------------------------------
// ~/.rnjb/settings.json — local only, never versioned (§6.2)
// ---------------------------------------------------------------------------

/** Only https and ssh git URLs without credentials are accepted (§6.3). */
export const gitUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === 'https:' || url.protocol === 'ssh:') &&
          url.hostname.length > 0 &&
          !hasCredentials(url)
        );
      } catch {
        return false;
      }
    },
    { message: 'RNJB-105' },
  );

const absolutePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes('\0'));

export const librarySourceSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('localPath'), path: absolutePath }),
  z.strictObject({ type: z.literal('git'), url: gitUrlSchema, ref: z.string().min(1) }),
  z.strictObject({
    type: z.literal('registry'),
    package: z.string().min(1),
    version: z.string().min(1),
  }),
]);

export const remoteSourceSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  remote: gitUrlSchema,
  ref: z.string().min(1),
  path: z.string().default(''),
  provider: z.enum(['bitbucket-cloud', 'bitbucket-data-center', 'git']),
});

export const localSettingsSchema = z.strictObject({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  workspacePath: absolutePath.optional(),
  librarySources: z.record(z.string(), librarySourceSchema).default({}),
  remoteSources: z.array(remoteSourceSchema).default([]),
  skillsPath: absolutePath.optional(),
  cacheDir: absolutePath.optional(),
  trashRetentionHours: z.union([z.literal(24), z.literal(48)]).default(48),
});

export type LibrarySource = z.infer<typeof librarySourceSchema>;
export type RemoteSource = z.infer<typeof remoteSourceSchema>;
export type LocalSettings = z.infer<typeof localSettingsSchema>;

export const defaultLocalSettings = (): LocalSettings =>
  localSettingsSchema.parse({ schemaVersion: SETTINGS_SCHEMA_VERSION });
