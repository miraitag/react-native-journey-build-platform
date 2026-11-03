import type { ErrorCode, ErrorParams, RnjbDocument, SerializedRnjbError } from '@rnjb/core';
import type { HooksPack, LibraryPack } from '@rnjb/pack-schema';
import type { MessageKey, Params } from '@rnjb/i18n';

export type ProblemSeverity = 'error' | 'warning' | 'info';

export type ProblemText =
  | { type: 'message'; key: MessageKey; params: Params }
  | { type: 'error'; code: ErrorCode; params: ErrorParams };

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  text: ProblemText;
  screenId?: string;
}

const SEVERITY_ORDER: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Packs that let the checks go beyond the document; without them those checks are skipped. */
export interface ProblemContext {
  hooks?: readonly HooksPack[];
  libraries?: readonly LibraryPack[];
}

/**
 * Problems of an open document (§10.2). Pure: recomputed from the document, the open issues
 * and the packages with a configured source.
 */
export function computeProblems(
  document: RnjbDocument,
  issues: readonly SerializedRnjbError[],
  resolvedPackages: ReadonlySet<string>,
  context: ProblemContext = {},
): Problem[] {
  const problems: Problem[] = issues.map((issue, index) => ({
    id: `issue-${index}`,
    severity: issue.severity,
    text: { type: 'error', code: issue.code, params: issue.params },
  }));

  for (const library of document.libraries) {
    if (resolvedPackages.has(library.package)) continue;
    problems.push({
      id: `library-${library.package}`,
      severity: 'warning',
      text: {
        type: 'message',
        key: 'editor.problems.libraryUnresolved',
        params: { package: library.package, version: library.version },
      },
    });
  }

  const screenIds = new Set(document.screens.map((screen) => screen.id));

  if (
    document.screens.length > 0 &&
    !(document.board.initialScreenId && screenIds.has(document.board.initialScreenId))
  ) {
    problems.push({
      id: 'no-initial',
      severity: 'error',
      text: { type: 'message', key: 'editor.problems.noInitial', params: {} },
    });
  }

  for (const screen of document.screens) {
    if (screen.states.length > 0) continue;
    problems.push({
      id: `states-${screen.id}`,
      severity: 'warning',
      screenId: screen.id,
      text: {
        type: 'message',
        key: 'editor.problems.screenWithoutStates',
        params: { screen: screen.name },
      },
    });
  }

  for (const connection of document.connections) {
    if (screenIds.has(connection.fromScreenId) && screenIds.has(connection.toScreenId)) continue;
    problems.push({
      id: `connection-${connection.id}`,
      severity: 'error',
      ...(screenIds.has(connection.fromScreenId) ? { screenId: connection.fromScreenId } : {}),
      text: { type: 'message', key: 'editor.problems.danglingConnection', params: {} },
    });
  }

  if (context.hooks) problems.push(...hookProblems(document, context.hooks));
  if (context.libraries) problems.push(...formProblems(document, context.libraries));

  return problems.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

function hookProblems(document: RnjbDocument, hooks: readonly HooksPack[]): Problem[] {
  const known = hooks.flatMap((pack) => pack.hooks);
  const problems: Problem[] = [];
  for (const screen of document.screens) {
    for (const usage of screen.logic.hooks) {
      const definition = known.find(
        (hook) => hook.name === usage.hook && hook.library === usage.library,
      );
      // A screen is the presentation layer (§14.2).
      if (!definition || definition.allowedLayers.includes('presentation')) continue;
      problems.push({
        id: `hook-layer-${usage.id}`,
        severity: 'error',
        screenId: screen.id,
        text: {
          type: 'message',
          key: 'editor.problems.hookLayer',
          params: {
            hook: usage.hook,
            screen: screen.name,
            layers: definition.allowedLayers.join(', '),
          },
        },
      });
    }
  }
  return problems;
}

function formProblems(document: RnjbDocument, libraries: readonly LibraryPack[]): Problem[] {
  const problems: Problem[] = [];
  for (const form of document.forms) {
    const screen = document.screens.find((candidate) => candidate.id === form.screenId);
    for (const field of form.fields) {
      if (!field.nodeId || !screen) continue;
      const node = screen.nodes[field.nodeId];
      const params = { form: form.name, field: field.name, screen: screen.name };
      if (!node) {
        problems.push({
          id: `field-node-${field.id}`,
          severity: 'error',
          screenId: screen.id,
          text: { type: 'message', key: 'editor.problems.fieldNodeMissing', params },
        });
        continue;
      }
      if (node.kind !== 'component') continue;
      const pack = libraries.find((candidate) => candidate.package === node.ref.package);
      const manifest = pack?.components.find((component) => component.name === node.ref.component);
      if (manifest && !manifest.formBinding) {
        problems.push({
          id: `field-binding-${field.id}`,
          severity: 'warning',
          screenId: screen.id,
          text: {
            type: 'message',
            key: 'editor.problems.fieldNoBinding',
            params: { ...params, component: node.ref.component },
          },
        });
      }
    }
  }
  return problems;
}

export const unresolvedLibraryCount = (
  document: RnjbDocument,
  resolvedPackages: ReadonlySet<string>,
): number => document.libraries.filter((library) => !resolvedPackages.has(library.package)).length;
