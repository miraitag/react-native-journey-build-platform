# ADR 0005 — Render en iframe y chrome del sistema

- Estado: propuesta
- Fase: F2

## Decisión

- La vista previa corre en un `<iframe sandbox="allow-scripts">` del tamaño lógico del dispositivo, con react-native-web. Sin `allow-same-origin`: el iframe no accede al almacenamiento ni al DOM del editor.
- Protocolo de mensajes tipado (Zod en ambos lados) para: documento de la pantalla, estado activo, geometría de nodos, errores de render.
- La selección, los resaltados y las zonas de soltar se dibujan en una capa superpuesta del editor, no dentro del iframe.
- `binding` y `expression` nunca se evalúan: se resuelven con datos de ejemplo o con el valor por defecto del manifiesto.
- El chrome del sistema (barra de estado, indicador de inicio, teclado) se dibuja dentro del iframe encima del contenido, desde los datos del pack de dispositivos. Se marca como "vista aproximada".

## Implementación (F2, primer corte)

- `packages/preview-runtime`: protocolo Zod (`rnjb:render`, `rnjb:ready`, `rnjb:rects`, `rnjb:error`), `buildScene` (pantalla a escena plana; `binding` usa datos de ejemplo, `expression` y código nunca se ejecutan), registro de shims y el frame con react-native-web.
- La página del iframe es `apps/web/preview.html`. Al no tener `allow-same-origin` su origen es opaco: el servidor que sirva los estáticos debe enviar `Access-Control-Allow-Origin` para los scripts de módulo (Vite dev y preview ya lo hacen con `cors: true`).
- Solo la pantalla seleccionada y con zoom suficiente (sin LOD) es viva; el resto sigue en vista estructural. Si el frame falla, se vuelve a la vista estructural.
- Pendiente: componentes reales de las librerías (compilación web, ADR 0007 pendiente) y shims; hoy cada componente se dibuja como marcador con la insignia "vista aproximada".

## Bundles de librería (F2, segundo corte)

- El servicio compila cada librería con Vite en modo librería (`GET /v1/libraries/bundle?package=`): salida IIFE, React, react-dom y react-native-web los aporta el iframe (`__rnjb`) y los módulos nativos se leen de `__rnjb.shims`. Caché en memoria por `paquete@versión+hash` del código fuente.
- Un módulo ESM cargado por URL no puede enviar el token, y el iframe tiene origen opaco: el editor descarga el bundle con el token y se lo pasa al iframe por `postMessage` (`rnjb:library`); el iframe lo evalúa como script inline. El `globalName` se valida con `^RnjbLib_[A-Za-z0-9_]+$`.
- Si falta un shim el bundle no carga y sus componentes quedan como marcadores; si un componente lanza al renderizar, solo él vuelve a marcador.
- Shims (`packages/preview-runtime/src/shim-modules.ts`): gesture-handler, reanimated, worklets, screens, safe-area-context, svg, clipboard, share, view-shot y netinfo. Svg se dibuja con elementos SVG del DOM; safe-area-context devuelve insets 0 porque el iframe ya queda dentro de los márgenes seguros del dispositivo; reanimated resuelve las animaciones a su valor final y no anima; gesture-handler no reconoce gestos. Cada shim lleva `__esModule` para que `import X from` resuelva su `default`.
