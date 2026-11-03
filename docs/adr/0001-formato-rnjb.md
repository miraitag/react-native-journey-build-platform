# ADR 0001 — Formato `.rnjb`

- Estado: aceptada
- Fase: F1

## Contexto

El journey debe poder guardarse, versionarse en git, abrirse de nuevo y reconstruirse tal cual (plan §8). Los diffs deben ser mínimos y la salida determinista (principio 7).

## Decisión

- JSON UTF-8 con **serialización canónica**: claves ordenadas lexicográficamente (por punto de código), sangría de 2 espacios, salto de línea final. Los arreglos conservan su orden porque tiene significado (orden de pantallas, hijos de un nodo).
- Los nodos de cada pantalla se indexan por ID estable (`nodes: Record<id, Node>`); el orden visual vive en `children` del padre.
- `integrity` = `sha256-<hex>` del documento canónico **sin** el campo `integrity`.
- `formatVersion` entero. Al abrir: sobre (envelope) → si la versión es más nueva que la plataforma, modo de recuperación de solo lectura → migraciones encadenadas `n → n+1` → validación Zod → checksum. Un checksum distinto también abre en recuperación.
- Rutas de assets siempre relativas a `assets/`; se rechazan rutas absolutas o con `..`.
- Implementación: `packages/document-schema`.

## Consecuencias

- Abrir y guardar sin cambios produce los mismos bytes (verificado con pruebas de propiedad).
- Editar a mano el archivo invalida el checksum: la plataforma lo detecta y ofrece recuperación en lugar de abrirlo en silencio.
