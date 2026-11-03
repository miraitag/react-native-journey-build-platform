import { defineConfig } from '@playwright/test';

const SERVICE_PORT = 4318;
const WEB_PORT = 4174;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** Perf budgets (plan §5.1) measured on the production build against `journey-50`. */
export default defineConfig({
  testDir: './e2e',
  // One baseline for every OS (see e2e/visual.spec.ts).
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'pnpm exec tsx scripts/serve-perf-service.ts',
      cwd: '../..',
      url: `http://127.0.0.1:${SERVICE_PORT}/v1/health`,
      env: { RNJB_PORT: String(SERVICE_PORT), RNJB_ALLOWED_ORIGINS: WEB_URL },
      reuseExistingServer: false,
    },
    {
      command: `vite build && vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { VITE_RNJB_SERVICE_URL: `http://127.0.0.1:${SERVICE_PORT}`, RNJB_PROFILE: '1' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
