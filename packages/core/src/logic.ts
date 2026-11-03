import type { Draft } from 'immer';
import type { Command } from './commands.ts';
import type { CodeBlock, HookUsage, RnjbDocument, Screen, ScreenLogic } from './entities.ts';
import { RnjbError } from './errors.ts';

function screenOf(draft: Draft<RnjbDocument>, screenId: string): Draft<Screen> {
  const screen = draft.screens.find((candidate) => candidate.id === screenId);
  if (!screen) throw new RnjbError('RNJB-602', { screenId });
  return screen;
}

function hookOf(screen: Draft<Screen>, hookId: string): Draft<HookUsage> {
  const hook = screen.logic.hooks.find((candidate) => candidate.id === hookId);
  if (!hook) throw new RnjbError('RNJB-608', { kind: 'hook', id: hookId });
  return hook;
}

const HOOK_NAME = /^use[A-Z0-9]/;

/** Hooks a hook depends on, i.e. the edges of the dependency graph (§14.2). */
export const hookDependencies = (hook: HookUsage, logic: ScreenLogic): string[] =>
  hook.dependencies.filter((id) => logic.hooks.some((other) => other.id === id));

/** `true` when following dependencies from `from` reaches `target` (including `from` itself). */
export function reaches(logic: ScreenLogic, from: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const hook = logic.hooks.find((candidate) => candidate.id === id);
    if (hook) stack.push(...hook.dependencies);
  }
  return false;
}

export interface NewHookUsage {
  hook: string;
  library: string;
  version: string;
}

export const addHook =
  (screenId: string, input: NewHookUsage, onCreated?: (hookId: string) => void): Command =>
  (draft, { ids }) => {
    const screen = screenOf(draft, screenId);
    if (!HOOK_NAME.test(input.hook)) {
      throw new RnjbError('RNJB-609', { kind: 'hook', name: input.hook });
    }
    const id = ids.next();
    screen.logic.hooks.push({
      id,
      hook: input.hook,
      library: input.library,
      version: input.version,
      bindings: {},
      dependencies: [],
    });
    onCreated?.(id);
  };

export const removeHook =
  (screenId: string, hookId: string): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    hookOf(screen, hookId);
    screen.logic.hooks = screen.logic.hooks.filter((hook) => hook.id !== hookId);
    for (const hook of screen.logic.hooks) {
      hook.dependencies = hook.dependencies.filter((id) => id !== hookId);
    }
  };

export interface HookPatch {
  version?: string;
  bindings?: Record<string, string>;
  /** Ids of other hooks of the same screen; a cycle is rejected with RNJB-603. */
  dependencies?: string[];
}

export const updateHook =
  (screenId: string, hookId: string, patch: HookPatch): Command =>
  (draft) => {
    const screen = screenOf(draft, screenId);
    const hook = hookOf(screen, hookId);
    if (patch.version !== undefined) hook.version = patch.version;
    if (patch.bindings) {
      for (const [name, value] of Object.entries(patch.bindings)) {
        if (name.trim() === '' || value.trim() === '') {
          throw new RnjbError('RNJB-609', { kind: 'binding', name });
        }
      }
      hook.bindings = { ...patch.bindings };
    }
    if (patch.dependencies) {
      const unique = [...new Set(patch.dependencies)];
      for (const id of unique) {
        hookOf(screen, id);
        if (id === hookId || reaches(screen.logic as ScreenLogic, id, hookId)) {
          throw new RnjbError('RNJB-603', { id });
        }
      }
      hook.dependencies = unique;
    }
  };

/** Sets or clears (with `undefined`) the code of an effect. It is stored, never executed. */
export const setHookBody =
  (screenId: string, hookId: string, body: Pick<CodeBlock, 'source'> | undefined): Command =>
  (draft) => {
    const hook = hookOf(screenOf(draft, screenId), hookId);
    if (body === undefined || body.source.trim() === '') delete hook.body;
    else hook.body = { language: 'ts', source: body.source, imports: hook.body?.imports ?? [] };
  };
