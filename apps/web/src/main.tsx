import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { Profiler, StrictMode, type ProfilerOnRenderCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';

declare global {
  interface Window {
    /** Set by the perf test: React commit durations, in ms (plan §23.10). */
    __reactCommits?: { phase: string; duration: number }[];
  }
}

const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
  window.__reactCommits?.push({ phase, duration: actualDuration });
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Profiler id="app" onRender={onRender}>
      <App />
    </Profiler>
  </StrictMode>,
);
