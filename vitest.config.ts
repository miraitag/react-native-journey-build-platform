import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `*.perf.ts` measure the §5.1 budgets on the generated journey-50 fixture: `pnpm test:perf`.
    include: process.env['RNJB_PERF']
      ? ['apps/*/src/**/*.perf.ts']
      : ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
