import { RnjbError, err, formatFieldPath, ok, type ErrorCode, type Result } from '@rnjb/core';
import type { z } from 'zod';
import {
  localSettingsSchema,
  teamConfigSchema,
  type LocalSettings,
  type TeamConfig,
} from './config.ts';
import { packSchema, type Pack } from './packs.ts';

function validateWith<T>(schema: z.ZodType<T>, raw: unknown, code: ErrorCode): Result<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const first = parsed.error.issues[0];
  return err(
    new RnjbError(code, {
      path: formatFieldPath(first?.path ?? []),
      detail: first?.message ?? '',
      count: parsed.error.issues.length,
    }),
  );
}

export const validatePack = (raw: unknown): Result<Pack> =>
  validateWith(packSchema, raw, 'RNJB-301');

export const validateTeamConfig = (raw: unknown): Result<TeamConfig> =>
  validateWith(teamConfigSchema, raw, 'RNJB-303');

/** `rnjb.team.json` as text: broken JSON is the same error as an invalid field. */
export function parseTeamConfig(text: string): Result<TeamConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return err(new RnjbError('RNJB-303', { path: '', detail: String(error), count: 1 }));
  }
  return validateTeamConfig(raw);
}

export const validateLocalSettings = (raw: unknown): Result<LocalSettings> =>
  validateWith(localSettingsSchema, raw, 'RNJB-405');
