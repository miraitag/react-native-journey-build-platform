# ADR 0006 — Persistencia y pestañas

- Estado: aceptada (shell en F3; persistencia completa en F5)
- Fase: F3/F5

## Decisión

- Estado con Zustand + Immer. Cada comando del dominio produce parches (`produceWithPatches`); los parches alimentan deshacer/rehacer (100 pasos por pestaña) y el borrador incremental.
- Cada pestaña guarda su documento, historial, selección y vista. Solo la pestaña activa monta lienzo e iframe.
- Más de 8 pestañas: las menos usadas se descargan al borrador (IndexedDB con Dexie) y se recargan al activarlas.
- Un journey abierto en una sola pestaña; entre ventanas se coordina con Web Locks y BroadcastChannel.
- Guardado en dos niveles: borrador (~800 ms) y archivo (5 s de inactividad, cerrar pestaña, Cmd/Ctrl+S). Serialización y hash en un Worker.
