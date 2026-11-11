import { create } from 'zustand';

const WELCOME = 'rnjb.onboarding.welcome';
const TOUR = 'rnjb.onboarding.tour';

const done = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === 'done';
  } catch {
    return true;
  }
};
const remember = (key: string, value: string | undefined) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the onboarding simply shows again next time.
  }
};

// shortcut: automated browsers (the e2e suite) start with the onboarding seen, unless a test sets
// `rnjb.onboarding` to `force`; upgrade to a per-test fixture if more specs need it.
const skipped = (): boolean => {
  try {
    return navigator.webdriver && localStorage.getItem('rnjb.onboarding') !== 'force';
  } catch {
    return false;
  }
};

interface OnboardingState {
  /** The welcome dialog is due: first launch, or replayed from the command palette. */
  welcome: boolean;
  /** The editor coachmarks are due; they start once the welcome is closed and an editor is open. */
  tour: boolean;
  finishWelcome: () => void;
  finishTour: () => void;
  replay: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  welcome: !skipped() && !done(WELCOME),
  tour: !skipped() && !done(TOUR),
  finishWelcome: () => {
    remember(WELCOME, 'done');
    set({ welcome: false });
  },
  finishTour: () => {
    remember(TOUR, 'done');
    set({ tour: false });
  },
  replay: () => {
    remember(WELCOME, undefined);
    remember(TOUR, undefined);
    set({ welcome: true, tour: true });
  },
}));
