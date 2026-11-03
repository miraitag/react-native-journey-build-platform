# ADR 0003 — Códecs y round-trip

- Estado: propuesta (se implementa en F8/F9; los códecs pueden empezar desde F2)
- Fase: F8

## Decisión

- Cada tipo de artefacto (pantalla, view-model, schema, navigator, values, gateway…) tiene un códec `{ emit(doc, conventions): VirtualFile[]; parse(files, conventions): Partial<Doc> }`.
- Propiedad obligatoria: `parse(emit(x)) = x`, verificada con fast-check por códec.
- Lo que un `parse` no reconoce se conserva como bloque de código con sus imports y ubicación; nunca se descarta.
- La exportación se detiene si algún nodo o hook no tiene códec, listándolos.

## Implementación (F9, primer corte)

- `parseProject` (`packages/codegen/src/parse.ts`) lee con el AST de TypeScript lo que `emitProject` escribe: pantallas (en el orden del navigator), estados, árbol JSX con props, layout y espaciado, conexiones (desde `goTo<Ruta>` y el nodo que lo dispara), pantalla inicial, strings y modelos. Los ids son deterministas.
- Lo que no se reconstruye (view-models, schemas, gateways, archivos ajenos) se conserva completo en `data.blocks`; el reporte los lista y da la cobertura por pantalla.
- Servicio: `POST /v1/import/run` lee `package.json` y `src/**/*.ts(x)` (sin symlinks, con topes) y crea el journey en el espacio de trabajo.
- Límites: formularios y hooks no se reconstruyen, el nombre visible sale del slug y no se distingue un literal de un ícono. La detección de perfil (§17.2) y la prueba de propiedad `parse(emit(x)) = x` con fast-check (`roundtrip.property.test.ts`) ya existen.

## Consecuencias

El perfil es intercambiable: un perfil nuevo puede reutilizar códecs con otras convenciones.
