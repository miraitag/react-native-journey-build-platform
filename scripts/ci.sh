#!/usr/bin/env sh
# Pipeline portable: el servidor de CI solo invoca este script.
set -eu

pnpm install --frozen-lockfile
pnpm format:check

# En una rama, solo los paquetes afectados frente a la rama base (y sus dependientes). En la rama
# base, o si no se puede comparar (clon sin historia), todo. TURBO_SCM_BASE la define el runner.
BASE="${TURBO_SCM_BASE:-origin/master}"
AFFECTED=""
if [ "$(git rev-parse --abbrev-ref HEAD)" != "${BASE#origin/}" ] && git rev-parse -q --verify "$BASE" >/dev/null; then
  AFFECTED="--affected"
  export TURBO_SCM_BASE="$BASE"
fi
pnpm turbo run lint lint:root typecheck test $AFFECTED
# Los exports de referencia instalan, compilan y pasan los checks del perfil (plan §23.4). Requiere red.
# Si las skills del equipo exigen su sistema de diseño, el runner define RNJB_DESIGN_SYSTEM con su paquete.
pnpm check:exports
# JS inicial < 300 KB gzip en el build de producción (plan §5.1).
pnpm check:bundle
# Presupuestos de rendimiento (plan §5.3). Requiere los navegadores de Playwright instalados.
pnpm test:perf
