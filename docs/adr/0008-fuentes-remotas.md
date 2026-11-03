# ADR 0008 — Fuentes remotas

- Estado: propuesta
- Fase: F6

## Decisión

- Un adaptador por proveedor solo interpreta URLs de navegación (Bitbucket Cloud y Data Center primero) y las separa en remoto, `ref` y carpeta, que el usuario confirma.
- La sincronización es git estándar: clon superficial y disperso (`--depth 50` en lugar de 1, para guardar en `provenance.remote.commit` el último commit que tocó cada archivo y detectar «actualización disponible» por archivo; `--filter=blob:none`, sparse checkout de `*.rnjb`, `packs/`, `rnjb.team.json`) en la caché.
- Credenciales: las que ya tiene la máquina (SSH o credential helper). No se piden ni se guardan tokens.
- Abrir un elemento remoto crea una copia local con `provenance.remote`. Solo lectura: sin commit ni push.
