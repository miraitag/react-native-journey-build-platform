# Guía de uso: RN Journey Builder

RN Journey Builder diseña journeys de React Native de forma visual y los exporta como una feature library lista para compilar. Cada archivo `.rnjb` guarda un journey completo: sus pantallas, navegación, formularios, lógica y datos.

## Arrancar

Requisitos: Node 22.12 o superior y pnpm.

```sh
pnpm install
pnpm dev
```

`pnpm dev` levanta dos procesos:

| Proceso        | Dirección               | Para qué                                                    |
| -------------- | ----------------------- | ----------------------------------------------------------- |
| Web            | `http://localhost:5173` | La plataforma                                               |
| Servicio local | `http://127.0.0.1:4317` | Lee y escribe en disco, extrae librerías, exporta e importa |

Sin el servicio local la plataforma sigue funcionando con menos funciones: abre y guarda archivos sueltos, y la barra de estado indica qué no está disponible.

Variables del servicio local (opcionales):

| Variable               | Valor por defecto                             | Uso                                    |
| ---------------------- | --------------------------------------------- | -------------------------------------- |
| `RNJB_PORT`            | `4317`                                        | Puerto del servicio                    |
| `RNJB_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Orígenes que pueden llamarlo           |
| `RNJB_HOME`            | `~/.rnjb`                                     | Ajustes de la máquina y caché          |
| `RNJB_BROWSE_ROOT`     | Tu carpeta personal                           | Hasta dónde puede navegar **Examinar** |

## Primeros pasos

La primera vez, Inicio muestra la tarjeta **Primeros pasos** con estos pasos en orden:

1. **Elegir el espacio de trabajo.** Es la carpeta donde viven `journeys/`, `templates/`, `packs/` y `rnjb.team.json`. Si está vacía, se crea la estructura.
2. **Importar el package.json del equipo.** Elige la carpeta de una feature library de referencia y, si quieres, la de su app de ejemplo. La plataforma propone las librerías y sus versiones, y las guarda en `rnjb.team.json`. Las dependencias que apuntan a rutas locales (`workspace:`, `file:`…) se omiten.
3. **Configurar las fuentes de librerías.** En **Ajustes**, indica dónde está el código de cada librería, para poder extraer sus componentes.
4. **Agregar fuentes remotas** (opcional). Pega la URL de un repositorio de Bitbucket con journeys y plantillas compartidos. Son de solo lectura y usan las credenciales de git de tu máquina; la plataforma nunca guarda un token.
5. **Crear tu primer journey,** desde una plantilla o importando una feature library existente.

La tarjeta desaparece cuando terminas los pasos obligatorios. También puedes ocultarla.

## Journeys y pestañas

- **Crear:** **Crear journey** (`Alt N`). El slug se deriva del nombre y define el paquete exportado.
- **Abrir:** desde Inicio, o un `.rnjb` suelto con **Abrir archivo** (`Ctrl/⌘ O`) o arrastrándolo a la ventana.
- **Pestañas:** cada journey o plantilla abre en su pestaña. `Ctrl/⌘ 1–9` cambia de pestaña, las flechas recorren la barra y `Supr` cierra la pestaña enfocada. A partir de 8 pestañas, las menos usadas se descargan de memoria y vuelven con su historial al activarlas.
- **Guardado:** hay dos niveles. El borrador se guarda en el navegador casi al instante. El archivo `.rnjb` se guarda 5 s después del último cambio, al cerrar, al ocultar la ventana y con `Ctrl/⌘ S`. Si cierras con cambios sin guardar en el archivo, el borrador queda en Inicio.
- **Papelera:** los journeys, pantallas y nodos eliminados se conservan 48 h (configurable a 24 h) y se pueden restaurar.

## Cambios externos

Si un archivo abierto cambia en disco (por ejemplo, después de un `git pull`):

- Si la pestaña no tiene cambios, se recarga y aparece un aviso.
- Si tiene cambios, la plataforma pregunta qué hacer:
  - **Comparar:** muestra qué pantallas, conexiones y secciones difieren.
  - **Conservar los míos:** el siguiente guardado reemplaza la versión del disco.
  - **Recargar:** descarta tus cambios y abre la versión del disco.

## Editor

- **Lienzo:** las pantallas del journey y sus conexiones. Doble clic en el nombre de una pantalla la acerca. `⇧ 1` ajusta todo a la vista y `Ctrl/⌘ +/−` cambia el zoom.
- **Modo Prototipo:** al hacer clic en un disparador se sigue la navegación, como en la app.
- **Enfoque:** muestra solo la pantalla seleccionada.
- **Catálogo:** arrastra componentes de las librerías a la pantalla. Las zonas inválidas se marcan.
- **Inspector:** props, layout (flexbox) y espaciado del nodo seleccionado. Un valor puede ser literal, texto del documento, token, ícono, binding o expresión. Doble clic en un texto lo edita sobre el lienzo.
- **Estados de pantalla:** cada pantalla tiene estados (por ejemplo `loading` o `success`) con datos de muestra.
- **Formularios, lógica y datos:** formularios con validación, hooks con sus dependencias, efectos editados en Monaco, y modelos y gateways en el panel **Datos**.
- **Problemas:** `Ctrl/⌘ ⇧ M` muestra los errores y avisos del journey.

La vista previa corre aislada en un iframe y nunca ejecuta las expresiones del documento.

## Dispositivos

En la barra superior del editor:

- **Dispositivo** y **Versión del sistema.** El chrome del sistema cambia según la versión: Liquid Glass en iOS 26 o superior, el estilo anterior en iOS 18, y Material 3 o Material 3 Expressive en Android. Es una aproximación visual, marcada con la insignia «Vista aproximada».
- **Orientación:** vertical u horizontal.
- **Postura:** en los plegables, cerrado, desplegado o medio abierto. Desplegado se dibuja la línea del pliegue. Medio abierto (libro o mesa) la app ve dos segmentos: los elementos que cruzan el pliegue se marcan en ámbar y la insignia «Cruzan el pliegue» dice cuántos son. Los contenedores y la pantalla pueden ocupar los dos segmentos; solo se marca lo que queda partido.
- **Comparar…:** muestra la pantalla seleccionada en hasta 2 dispositivos más. Esas vistas se actualizan 300 ms después de dejar de editar.
- **Dispositivos personalizados:** el ícono de teléfono crea dispositivos propios en `packs/devices/custom.json`.

Al cambiar de dispositivo, si estabas editando una pantalla de cerca, el lienzo la mantiene encuadrada; si no, vuelve a mostrar todo el journey.

En el pack integrado, los dispositivos con fuente (fichas de Apple, DeviceAtlas) citan de dónde sale su tamaño; las áreas seguras, los recortes y los radios son aproximados. Para usar datos curados, agrega a `packs/devices/` un pack con el mismo `id` de dispositivo.

## Exportar

**Exportar** genera la feature library con el perfil del journey.

1. Elige el destino: una carpeta nueva, o un repositorio existente con todo el proyecto o solo `src/`.
2. Revisa el diff de cada archivo antes de escribir. En un repositorio existente se hace un merge de 3 vías con la exportación anterior, registrada en `.rnjb/export.lock.json`. Cada conflicto se resuelve con tu versión, la del repositorio o editándolo a mano.
3. Confirma. Solo se escriben los archivos que cambiaron. Si el repositorio tiene cambios sin commit, se avisa antes.
4. Opcional: **Ejecutar checks** corre los checks del perfil (tsc, eslint…) sobre la carpeta elegida.

Puedes exportar varias veces sin hacer commit entre una y otra: los archivos que no tocaste a mano se actualizan sin conflictos.

## Importar un repositorio

**Importar** crea un journey a partir de una feature library existente. El repositorio solo se lee.

- **Perfil:** se detecta por la estructura de carpetas. Si ningún perfil llega al 70 %, se usa el perfil por defecto y lo que no coincide queda como bloques de código.
- **Reporte:** muestra la cobertura por pantalla, los archivos conservados completos como bloques de código y los archivos de `src/` que no se leyeron (no son TypeScript o pasan de 512 KB). La exportación no regenera esos archivos.

## Atajos

| Acción                                      | Atajo                     |
| ------------------------------------------- | ------------------------- |
| Paleta de comandos                          | `Ctrl/⌘ K`                |
| Ayuda de atajos                             | `?`                       |
| Ajustes                                     | `Ctrl/⌘ ,`                |
| Guardar / Guardar como                      | `Ctrl/⌘ S` / `Ctrl/⌘ ⇧ S` |
| Deshacer / Rehacer                          | `Ctrl/⌘ Z` / `Ctrl/⌘ ⇧ Z` |
| Eliminar el nodo o la pantalla seleccionada | `⌫`                       |
| Cerrar la pestaña enfocada                  | `Supr`                    |

## Si algo falla

- **«El servicio local no está activo»:** comprueba que `pnpm dev` siga corriendo y pulsa **Reintentar** en Inicio.
- **«No se pudo guardar el archivo»:** abre **Problemas**. Si otro programa cambió el archivo, la plataforma te ofrece comparar, conservar tus cambios o recargar.
- **Un componente se ve como marcador:** su librería no tiene bundle (falta la fuente o un shim nativo). Revisa la fuente en **Ajustes**.
- **Pantalla estrecha:** con menos de 1024 px de ancho solo se muestra el lienzo; amplía la ventana para editar.
