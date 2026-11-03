# ADR 0002 — Packs y perfiles

- Estado: aceptada
- Fase: F1

## Contexto

Nada específico de un proyecto ni de una máquina puede vivir en el código (principios 2 y 3).

## Decisión

- Cinco tipos de pack (`library`, `hooks`, `devices`, `blocks`, `profile`), todos con `schemaVersion`, `kind`, `id` y `version`, validados con Zod en `packages/pack-schema`.
- `rnjb.team.json` (compartible) declara packs activos, librerías requeridas con rango semver y perfil por defecto.
- `~/.rnjb/settings.json` (local, nunca versionado) guarda rutas, fuentes de librería y fuentes remotas. Es el único lugar con rutas absolutas.
- Los datos extraídos llevan `origin: "extracted"` y los corregidos por el equipo `origin: "curated"`; la extracción nunca sobrescribe lo curado.
- Los errores de validación se reportan con la ruta exacta del campo (`libraries[2].version`).
- Importar `package.json` propone librerías y plantillas de dependencias **solo** a partir de los archivos importados; la clasificación por rol se guarda en packs, no en el código.

## Consecuencias

Cambiar de sistema de diseño, dispositivos o convenciones es editar JSON, no publicar una versión de la plataforma.
