import { toast } from 'sonner';
import { RnjbError, isRnjbError, type SerializedRnjbError } from '@rnjb/core';
import type { Translator } from '@rnjb/i18n';
import { ServiceError } from '../services/local-service.ts';
import { currentTranslator } from './preferences.ts';

/** Typed errors keep their code; anything else becomes `fallback`. */
export function toSerialized(
  error: unknown,
  fallback: RnjbError = new RnjbError('RNJB-401'),
): SerializedRnjbError {
  if (error instanceof ServiceError || isRnjbError(error)) return error.toJSON();
  return fallback.toJSON();
}

export function reportError(error: unknown, i18n: Translator = currentTranslator()): void {
  if (error instanceof ServiceError || isRnjbError(error)) {
    const { message, action } = i18n.error(error.code, error.params);
    toast.error(message, { description: action, duration: Infinity });
    return;
  }
  console.error(error);
  toast.error(i18n.t('open.failed'), { description: String(error), duration: Infinity });
}
