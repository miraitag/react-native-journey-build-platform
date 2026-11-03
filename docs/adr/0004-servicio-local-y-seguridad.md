# ADR 0004 — Servicio local y su seguridad

- Estado: aceptada
- Fase: F1

## Decisión

- Fastify escuchando **solo** en `127.0.0.1`.
- **Origen:** toda petición debe traer un `Origin` de la lista permitida (por defecto, el origen de la web app en desarrollo). Las peticiones sin `Origin` se rechazan salvo `GET /v1/health`.
- **Host:** se valida que `Host` sea `127.0.0.1:<puerto>` o `localhost:<puerto>` (protección contra DNS rebinding).
- **Token de sesión:** aleatorio de 256 bits por arranque. Se entrega en `POST /v1/session` solo a un origen permitido y se exige en `Authorization: Bearer` en el resto de rutas. Comparación en tiempo constante.
- **Rutas:** toda ruta se resuelve con `path.resolve` + `realpath` del ancestro existente y se rechaza si sale de la raíz permitida (espacio de trabajo, caché o ruta elegida explícitamente). Aplica también a rutas que vengan de un `.rnjb` o de una fuente remota.
- **Procesos externos (F2+):** `spawn` con argumentos en arreglo, `shell: false` y `--` antes de entradas del usuario.
- **Fuentes git:** solo `https:` y `ssh:`. La plataforma no pide ni guarda tokens.
- CORS solo para los orígenes permitidos.

## Consecuencias

Una página maliciosa abierta en el navegador no puede leer ni escribir el disco a través del servicio, aunque conozca el puerto.
