import { applyPatches, type Patch } from 'immer';
import type { RnjbDocument } from './entities.ts';

/** Undo/redo built on the patches every command produces (plan §18.1). */

export const HISTORY_LIMIT = 100;

export interface HistoryStep {
  patches: Patch[];
  inversePatches: Patch[];
}

export interface History {
  past: HistoryStep[];
  future: HistoryStep[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Adds a step; a new edit drops the redo branch. Keeps the last `limit` steps. */
export function recordStep(history: History, step: HistoryStep, limit = HISTORY_LIMIT): History {
  if (step.patches.length === 0) return history;
  const past = [...history.past, step];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export interface TimeTravel {
  document: RnjbDocument;
  history: History;
  /** Patches applied to reach `document`, so mirrors (worker, drafts) can follow. */
  applied: Patch[];
}

export function undo(document: RnjbDocument, history: History): TimeTravel | undefined {
  const step = history.past.at(-1);
  if (!step) return undefined;
  return {
    document: applyPatches(document, step.inversePatches),
    history: { past: history.past.slice(0, -1), future: [step, ...history.future] },
    applied: step.inversePatches,
  };
}

export function redo(document: RnjbDocument, history: History): TimeTravel | undefined {
  const step = history.future[0];
  if (!step) return undefined;
  return {
    document: applyPatches(document, step.patches),
    history: { past: [...history.past, step], future: history.future.slice(1) },
    applied: step.patches,
  };
}
