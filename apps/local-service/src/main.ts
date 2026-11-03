import os from 'node:os';
import path from 'node:path';
import { createSessionToken } from './security.ts';
import { buildServer } from './server.ts';
import { SettingsStore } from './settings-store.ts';

const port = Number(process.env.RNJB_PORT ?? 4317);
const allowedOrigins = (
  process.env.RNJB_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const home = process.env.RNJB_HOME ?? path.join(os.homedir(), '.rnjb');

const app = buildServer({
  port,
  allowedOrigins,
  token: createSessionToken(),
  settings: new SettingsStore(home),
  ...(process.env.RNJB_BROWSE_ROOT ? { browseRoot: process.env.RNJB_BROWSE_ROOT } : {}),
  logger: true,
});

// 127.0.0.1 only (ADR 0004); never 0.0.0.0.
await app.listen({ host: '127.0.0.1', port });
