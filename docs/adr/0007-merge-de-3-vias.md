# ADR 0007 — Merge de 3 vías

- Estado: propuesta
- Fase: F8

## Decisión

- Cada exportación escribe `.rnjb/export.lock.json` en el destino: checksum del `.rnjb`, versiones de perfil y plataforma, y hash de cada archivo generado.
- Base = archivo en el último commit que modificó el lock (`git show`); nuestra = generado; suya = disco.
- Sin git: los hashes del lock deciden qué archivos no se tocaron a mano (se actualizan) y el resto se compara a 2 vías.
- Journey importado sin lock: 2 vías contra el commit de `provenance.importedFrom`.
- Nada se escribe sin revisión en el editor de diff y confirmación explícita; se avisa si hay cambios sin commit.

## Implementación (F8, primer corte)

- `packages/codegen`: `emitProject` (árbol virtual de archivos del perfil por defecto), `merge3` (diff3 por líneas con marcadores) y `planExport` (estados new, unchanged, update, merged, conflict; lista los archivos obsoletos del lock sin borrarlos).
- El servicio expone `/v1/export/plan`, `/v1/export/apply` y `/v1/export/check`. Solo escribe rutas que el emisor genera, dentro de una carpeta bajo la raíz de exploración; el lock se escribe al confirmar.
- Base git: `git show` del último commit que cambió el lock. Sin git se usan los hashes del lock; sin lock, 2 vías.
- Pendiente: formateo con Prettier, ZIP, round-trip con `parse` (F9), editor de diff de Monaco (hoy se muestran dos versiones y un textarea) y reglas de descomposición de pantallas.
