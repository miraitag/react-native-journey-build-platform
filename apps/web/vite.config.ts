import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    // The local service only accepts this exact origin (ADR 0004).
    port: 5173,
    strictPort: true,
    // The preview iframe is sandboxed without allow-same-origin, so its origin is opaque (ADR 0005).
    cors: true,
  },
  preview: { cors: true },
  worker: { format: 'es' },
  // The e2e build profiles React commits (plan §23.10); a normal build drops `<Profiler>` callbacks.
  resolve: process.env['RNJB_PROFILE']
    ? { alias: [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] }
    : {},
  build: {
    target: 'es2023',
    sourcemap: true,
    rolldownOptions: {
      input: { main: 'index.html', preview: 'preview.html' },
    },
  },
});
