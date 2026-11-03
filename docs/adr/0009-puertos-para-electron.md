# ADR 0009 — Puertos para Electron

- Estado: aceptada
- Fase: F1

## Decisión

- `packages/core` define puertos (`WorkspacePort`, `SettingsPort`, `ClockPort`, `IdPort`, `HashPort`) y no depende de React, del navegador ni de Node.
- La web app implementa los puertos contra el servicio local (HTTP) o la File System Access API; Electron los implementará con IPC sin cambiar el dominio.
- Regla de lint: `core`, `document-schema` y `pack-schema` no pueden importar `react`, `node:*` ni `fastify`.
