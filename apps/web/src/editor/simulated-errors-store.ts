import { create } from 'zustand';

interface SimulatedErrorsState {
  /** Fields whose error state is shown in the preview; never saved with the document. */
  fields: Readonly<Record<string, true>>;
  toggle: (fieldId: string, on: boolean) => void;
}

export const useSimulatedErrors = create<SimulatedErrorsState>((set) => ({
  fields: {},
  toggle: (fieldId, on) =>
    set((state) => {
      const { [fieldId]: _removed, ...rest } = state.fields;
      return { fields: on ? { ...rest, [fieldId]: true } : rest };
    }),
}));
