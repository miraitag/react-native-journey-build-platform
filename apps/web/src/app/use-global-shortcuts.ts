import { useEffect } from 'react';
import { isTyping, onCanvas } from './focus.ts';
import { extractFragment } from '@rnjb/core';
import { useT } from './preferences.ts';
import { useDialogs } from './dialogs-store.ts';
import { HOME_TAB, canEdit, useTabs } from './tabs-store.ts';
import { openFromDisk } from './open-document.ts';
import { saveAs, saveFile } from './persistence.ts';
import { trashNode, trashScreen } from './trash.ts';
import {
  copySelection,
  cutSelection,
  duplicateSelection,
  moveSelection,
  navigate,
  nudgeScreen,
  pasteClipboard,
  selectScreenBy,
  selectionOf,
  unwrapSelection,
  wrapSelection,
} from '../editor/node-actions.ts';

/** Global shortcuts (§10.3). Board-level shortcuts live in the board itself. */
export function useGlobalShortcuts(): void {
  const i18n = useT();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const dialogs = useDialogs.getState();
      const tabs = useTabs.getState();
      const active = tabs.tabs.find((tab) => tab.id === tabs.activeId);
      const key = event.key.toLowerCase();

      if (mod && !event.altKey && key === 's') {
        event.preventDefault();
        if (active && canEdit(active)) {
          if (event.shiftKey) void saveAs(active.id);
          else void saveFile(active.id, { interactive: true });
        }
        return;
      }

      if (mod && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialogs.open === 'palette') dialogs.hide();
        else dialogs.show('palette');
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        dialogs.show('settings');
        return;
      }
      if (mod && !event.shiftKey && !event.altKey && /^Digit[1-9]$/.test(event.code)) {
        event.preventDefault();
        tabs.activateIndex(Number(event.code.slice(5)) - 1);
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openFromDisk(i18n);
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        if (active && tabs.activeId !== HOME_TAB)
          tabs.updateView(active.id, { problemsOpen: !active.view.problemsOpen });
        return;
      }
      if (dialogs.open || isTyping(event.target)) return;
      // Text fields keep their own undo; everything else undoes document changes.
      if (mod && !event.altKey && (key === 'z' || key === 'y') && active && canEdit(active)) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) tabs.redo(active.id);
        else tabs.undo(active.id);
        return;
      }
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !mod &&
        active &&
        canEdit(active)
      ) {
        const { selectedScreenId } = active.view;
        const screen = active.document?.screens.find((item) => item.id === selectedScreenId);
        if (!screen) return;
        event.preventDefault();
        // Only the top-most nodes: a selected child goes with its parent.
        const nodes = extractFragment(screen, selectionOf(active.view))?.rootIds ?? [];
        if (nodes.length === 0) void trashScreen(active.id, screen.id);
        else for (const id of nodes) void trashNode(active.id, screen.id, id);
        return;
      }
      // Node and canvas shortcuts (§10.3), as in Figma, Adobe and Affinity. Without a selection
      // the browser keeps its own behaviour.
      if (active && tabs.activeId !== HOME_TAB) {
        const id = active.id;
        const shift = event.shiftKey;
        const plain = !mod && !event.altKey;
        // Tab, Enter, Esc and arrows only on the canvas: in the panels they move focus as usual.
        const canvas = onCanvas(event.target);
        const step = shift ? 80 : 8;
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const actions: [boolean, () => boolean][] = [
          [mod && !event.altKey && !shift && key === 'c', () => copySelection(id)],
          [mod && !event.altKey && !shift && key === 'x', () => cutSelection(id)],
          [mod && !event.altKey && !shift && key === 'v', () => pasteClipboard(id)],
          [mod && !event.altKey && !shift && key === 'd', () => duplicateSelection(id)],
          // ⌘G groups as in Figma; ⌘⌥G (frame selection) does the same here.
          [mod && !shift && event.code === 'KeyG', () => wrapSelection(id)],
          [mod && shift && event.code === 'KeyG', () => unwrapSelection(id)],
          [canvas && mod && !event.altKey && !shift && key === 'a', () => navigate(id, 'siblings')],
          [
            (event.altKey && !mod && event.key === 'ArrowUp') || (mod && event.key === '['),
            () => moveSelection(id, -1),
          ],
          [
            (event.altKey && !mod && event.key === 'ArrowDown') || (mod && event.key === ']'),
            () => moveSelection(id, 1),
          ],
          [canvas && plain && event.key === 'Escape', () => navigate(id, 'parent')],
          [canvas && plain && event.key === 'Enter' && !shift, () => navigate(id, 'children')],
          [
            canvas && plain && ((event.key === 'Enter' && shift) || event.key === '\\'),
            () => navigate(id, 'parent'),
          ],
          [
            canvas && plain && event.key === 'Tab',
            () =>
              active.view.selectedNodeId
                ? navigate(id, shift ? 'previous' : 'next')
                : selectScreenBy(id, shift ? -1 : 1),
          ],
          [
            canvas && plain && event.key in arrows,
            () => nudgeScreen(id, ...(arrows[event.key] as [number, number])),
          ],
        ];
        if (actions.find(([when]) => when)?.[1]()) {
          event.preventDefault();
          return;
        }
      }
      if (event.altKey && !mod && event.code === 'KeyN') {
        event.preventDefault();
        dialogs.show('create');
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        dialogs.show('shortcuts');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [i18n]);
}
