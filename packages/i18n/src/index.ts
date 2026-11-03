import type { ErrorCode, ErrorParams } from '@rnjb/core';
import { en } from './en.ts';
import { es, type Messages } from './es.ts';

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

export const dictionaries: Record<Locale, Messages> = { es, en };

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Params = Record<string, string | number>;

function lookup(messages: Messages, key: string): string {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return typeof node === 'string' ? node : key;
}

export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function createTranslator(locale: Locale) {
  const messages = dictionaries[locale];
  const t = (key: MessageKey, params?: Params): string =>
    interpolate(lookup(messages, key), params);
  const error = (code: ErrorCode, params: ErrorParams = {}) => ({
    message: interpolate(messages.errors[code].message, params),
    action: interpolate(messages.errors[code].action, params),
  });
  return { locale, t, error };
}

export type Translator = ReturnType<typeof createTranslator>;

export type { Messages };
