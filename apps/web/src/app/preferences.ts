import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { DEFAULT_LOCALE, createTranslator, type Locale } from '@rnjb/i18n';

export type ThemePreference = 'system' | 'light' | 'dark';

const storedTheme = (): ThemePreference => {
  const value = localStorage.getItem('rnjb.theme');
  return value === 'light' || value === 'dark' ? value : 'system';
};

const storedLocale = (): Locale => {
  const value = localStorage.getItem('rnjb.locale');
  return value === 'en' || value === 'es' ? value : DEFAULT_LOCALE;
};

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

/** Both automatic saves are on unless the user turned them off (§18.2). */
const storedFlag = (key: string): boolean => localStorage.getItem(key) !== 'false';

interface PreferencesState {
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  locale: Locale;
  autosaveDraft: boolean;
  autosaveFile: boolean;
  /** The flow layer on the canvas: navigations drawn prominently, with their triggers. */
  showFlow: boolean;
  setShowFlow: (on: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale) => void;
  setAutosave: (kind: 'draft' | 'file', enabled: boolean) => void;
  syncSystemTheme: () => void;
}

const resolve = (theme: ThemePreference): 'light' | 'dark' =>
  theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : theme;

export const usePreferences = create<PreferencesState>((set, get) => ({
  theme: storedTheme(),
  resolvedTheme: resolve(storedTheme()),
  locale: storedLocale(),
  autosaveDraft: storedFlag('rnjb.autosaveDraft'),
  autosaveFile: storedFlag('rnjb.autosaveFile'),
  showFlow: localStorage.getItem('rnjb.showFlow') === 'true',
  setShowFlow: (on) => {
    localStorage.setItem('rnjb.showFlow', String(on));
    set({ showFlow: on });
  },
  setTheme: (theme) => {
    localStorage.setItem('rnjb.theme', theme);
    set({ theme, resolvedTheme: resolve(theme) });
  },
  setLocale: (locale) => {
    localStorage.setItem('rnjb.locale', locale);
    set({ locale });
  },
  setAutosave: (kind, enabled) => {
    localStorage.setItem(
      kind === 'draft' ? 'rnjb.autosaveDraft' : 'rnjb.autosaveFile',
      String(enabled),
    );
    set(kind === 'draft' ? { autosaveDraft: enabled } : { autosaveFile: enabled });
  },
  syncSystemTheme: () => set({ resolvedTheme: resolve(get().theme) }),
}));

/** Keeps `<html data-theme>` and `<html lang>` in sync with the preferences. */
export function usePreferenceEffects(): void {
  const resolvedTheme = usePreferences((state) => state.resolvedTheme);
  const locale = usePreferences((state) => state.locale);
  const syncSystemTheme = usePreferences((state) => state.syncSystemTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    darkQuery.addEventListener('change', syncSystemTheme);
    return () => darkQuery.removeEventListener('change', syncSystemTheme);
  }, [syncSystemTheme]);
}

export function useT() {
  const locale = usePreferences((state) => state.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

/** For code outside components (persistence, trash) that reports to the user. */
export const currentTranslator = () => createTranslator(usePreferences.getState().locale);
