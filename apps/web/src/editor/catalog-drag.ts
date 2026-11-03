import { create } from 'zustand';
import type { DraggedComponent } from './insert-component.ts';

interface DragState {
  /** `dataTransfer` data is unreadable during dragover, so the dragged item lives here. */
  dragged: DraggedComponent | undefined;
  start: (item: DraggedComponent) => void;
  end: () => void;
}

export const useCatalogDrag = create<DragState>((set) => ({
  dragged: undefined,
  start: (dragged) => set({ dragged }),
  end: () => set({ dragged: undefined }),
}));
