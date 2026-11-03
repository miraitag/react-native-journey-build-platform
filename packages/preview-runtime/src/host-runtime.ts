import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactJsx from 'react/jsx-runtime';
import * as ReactNative from 'react-native-web';
import { createShims } from './shim-modules.ts';

/**
 * Runtime the compiled library bundles read from (`__rnjb`, see the local service's compiler):
 * React, react-native-web and the native-module shims (plan §7.4). A shim that is not here makes
 * the bundle fail to load, and its components render as placeholders ("approximate view").
 */
export function installHostRuntime(): void {
  (globalThis as Record<string, unknown>)['__rnjb'] = {
    React,
    ReactDOM,
    jsx: ReactJsx,
    ReactNative,
    shims: createShims(
      React as unknown as Parameters<typeof createShims>[0],
      ReactNative as unknown as Record<string, unknown>,
    ),
  };
}

/** Evaluates a compiled bundle and returns its exports; throws when it cannot initialise. */
export function loadBundle(globalName: string, code: string): Record<string, unknown> {
  const script = document.createElement('script');
  script.textContent = code;
  document.head.append(script);
  script.remove();
  const exported = (globalThis as Record<string, unknown>)[globalName];
  if (exported === undefined || exported === null || typeof exported !== 'object') {
    throw new Error('The bundle exported nothing');
  }
  return exported as Record<string, unknown>;
}
