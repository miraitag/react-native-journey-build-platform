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

Sin el servicio local la plataforma sigue funcionando con menos funciones: abre y guarda archivos sueltos, en Chrome y Edge abre también la carpeta del espacio de trabajo (**Abrir carpeta** en Inicio) y lista sus `.rnjb`, y la barra de estado indica qué no está disponible.

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
3. **Configurar las fuentes de librerías.** En **Ajustes**, indica dónde está el código de cada librería, para poder extraer sus componentes. Las librerías del equipo que aún no tienen fuente aparecen como botones: pulsa una para rellenar su nombre. Para las primitivas (`View`, `Text`, `TextInput`, `Button`…), usa como fuente la carpeta `node_modules/react-native` de cualquier app del equipo. La plataforma ya conoce sus reglas: `TextInput` o `Image` no aceptan hijos, `Text` solo acepta `Text`, y qué texto se edita en el lienzo. En la vista previa se dibujan con react-native-web, sin compilar nada.
4. **Agregar fuentes remotas** (opcional). Pega la URL de un repositorio de Bitbucket con journeys y plantillas compartidos. Son de solo lectura y usan las credenciales de git de tu máquina; la plataforma nunca guarda un token.
5. **Crear tu primer journey,** desde una plantilla o importando una feature library existente.

La tarjeta desaparece cuando terminas los pasos obligatorios. También puedes ocultarla.

## Journeys y pestañas

- **Crear:** **Crear journey** (`Alt N`). El slug se deriva del nombre y define el paquete exportado.
- **Buscar en Inicio:** por nombre, slug o librería, y con filtros de origen (local, importado, remoto), librería, perfil y fecha de modificación.
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

- **Lienzo:** las pantallas del journey y sus conexiones. Se navega como en Figma: dos dedos en el trackpad (o la rueda) desplazan, el pellizco o `Ctrl/⌘` + rueda acercan en el cursor, y `Espacio` + arrastrar mueve el lienzo con la mano. Funciona también encima de la pantalla en vivo. Seleccionar una pantalla no mueve la cámara; doble clic en su nombre la acerca. Las últimas pantallas seleccionadas siguen dibujadas con la vista previa real.
- **Flujo:** el botón **Flujo** (o `⇧F`) dibuja las navegaciones como un navigation graph: flechas de acento con la punta siempre visible, en arco por encima de las pantallas que saltan y por debajo cuando vuelven. Las navegaciones que salen de un elemento llevan una etiqueta con su nombre, y ese elemento se marca con un contorno punteado en la pantalla en vivo. Las flechas de la pantalla seleccionada se ven al 100 % y el resto atenuadas. La preferencia se recuerda.
- **Pantallas como flujo:** el panel **Pantallas** muestra el journey como un árbol: cada pantalla cuelga de la que navega a ella, empezando por la inicial. Arrastra una pantalla sobre otra para indicar que esa otra navega a ella; arriba o abajo de una fila, la deja al mismo nivel, y una línea marca dónde caerá: debajo de una fila, mueve el puntero a la izquierda para sacarla de nivel (la línea se recorre hasta el nivel de destino). La pantalla inicial es solo una; puedes moverla de lugar entre las de nivel superior, pero no anidarla. Al moverla se quita la navegación anterior si no tenía disparador; las que salen de un elemento solo se quitan en **Inspector › Navegación**. Una pantalla a la que se llega por otro camino, o un ciclo, aparece como referencia con el ícono de enlace. Sin mouse, el menú de cada pantalla tiene **Anidar bajo «…»** y **Sacar de «…»**.
- **Bienvenida y tour:** la primera vez que abres la plataforma ves una bienvenida de cinco pasos, y al abrir un journey, un tour que señala cada zona del editor (Esc lo cierra; ← → cambian de paso). Para verlos de nuevo: menú **Ayuda** arriba a la derecha (o la paleta de comandos, Ctrl/⌘ K) › **Ver la bienvenida y el tour de nuevo**.
- **Modo Prototipo:** como la vista de presentación de Figma, oculta el editor y muestra solo la pantalla actual sobre un fondo oscuro. Arriba ves el nombre de la pantalla y el paso, el botón de pantalla completa real y **Salir (Esc)**; abajo, una barra con lo que puedes hacer.
  - Los elementos con navegación (disparadores) se marcan; un clic fuera de ellos los resalta.
  - Las navegaciones sin disparador, como las del Journey básico, aparecen como botones en la barra.
  - **Atrás** (`⌫` o `←`), **Reiniciar** y **Salir** (`Esc`).
  - Si la pantalla no lleva a ninguna otra, la barra lo dice: selecciona un elemento y agrega una navegación en **Inspector › Navegación**.
- **Enfoque:** muestra solo la pantalla seleccionada.
- **Catálogo:** arrastra componentes de las librerías a la pantalla, o pulsa uno para añadirlo dentro del nodo seleccionado. Las zonas inválidas se marcan. Se agrupa por librería o por categoría; cada librería muestra su versión y avisa si el documento usa otra. La flecha de un componente despliega sus variantes, que se añaden o arrastran igual. Al volver a extraer una librería, si su manifiesto cambió, se muestran los componentes y props nuevos, eliminados o cambiados para aceptarlos o rechazarlos; nada se guarda antes de aceptar.
- **Selección y edición rápida:** `⇧`+clic, en Capas o en el lienzo, agrega o quita nodos de la selección. Con nodos seleccionados puedes copiar (`Ctrl/⌘ C`) y pegar (`Ctrl/⌘ V`) entre pantallas, pestañas y journeys (los textos viajan con ellos), duplicar (`Ctrl/⌘ D`), envolverlos en un contenedor (`Ctrl/⌘ G`, solo si son hermanos) y mover el nodo arriba o abajo (`Alt ↑/↓`).
- **Bloques:** selecciona uno o varios nodos, escribe un nombre en el panel **Bloques** y pulsa **Guardar como bloque**. El bloque se guarda en `packs/blocks/workspace.json` y se puede arrastrar o añadir en cualquier journey; al insertarlo, sus nodos reciben IDs nuevos. Si guardas varios nodos, quedan dentro de un `View`.
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
- **Comparar:** revisa cómo se adapta la pantalla seleccionada a otros tamaños y plataformas. Muestra el dispositivo principal y hasta 2 más, lado a lado y a la misma escala, con su tamaño y versión de SO. Al abrirlo por primera vez propone el primer dispositivo de la otra plataforma y el más estrecho de la misma. Quita uno con su **×** o añade otro con **Añadir dispositivo…**. El principal se actualiza al instante y los demás 300 ms después de dejar de editar. `Esc` vuelve al lienzo.
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

- **Origen:** una carpeta local (**Examinar**) o una URL git con su rama, tag o commit. Se aceptan URLs de navegación de Bitbucket Cloud y Data Center: la plataforma toma de ellas el remoto, la rama y la carpeta. El clon usa las credenciales git de la máquina y se guarda en la caché.
- **Revisión:** **Analizar** muestra el reporte sin escribir nada. **Crear journey** escribe el `.rnjb` y lo abre en una pestaña. Si el repositorio usa git, el journey guarda en `provenance.importedFrom` el remoto y el commit, nunca la ruta local.
- **Perfil:** se detecta por la estructura de carpetas, y en el reporte puedes elegir otro. Si ningún perfil llega al 70 %, se usa el perfil por defecto y lo que no coincide queda como bloques de código.
- **Reporte:** muestra la cobertura por pantalla, los archivos conservados completos como bloques de código y los archivos de `src/` que no se leyeron (no son TypeScript o pasan de 512 KB). La exportación no regenera esos archivos.

## Atajos

`?` muestra todos los atajos. Siguen las convenciones de Figma, Adobe y Affinity. `Enter`, `Esc`, `Tab` y las flechas actúan cuando el foco está en el lienzo; en los paneles conservan su función habitual.

| Lienzo                               | Atajo                                  |
| ------------------------------------ | -------------------------------------- |
| Mover el lienzo (mano)               | `Espacio` + arrastrar, o botón central |
| Desplazar / horizontal               | Dos dedos o rueda / `⇧` + rueda        |
| Acercar o alejar en el cursor        | Pellizco o `Ctrl/⌘` + rueda            |
| Acercar / alejar                     | `Ctrl/⌘ +` / `Ctrl/⌘ −`                |
| Zoom al 100 %                        | `⇧ 0` o `Ctrl/⌘ 0`                     |
| Ajustar todo / ajustar a la pantalla | `⇧ 1` / `⇧ 2`                          |
| Mover la pantalla seleccionada       | Flechas (`⇧` ×10)                      |
| Mostrar u ocultar el flujo           | `⇧ F`                                  |

| Selección                        | Atajo             |
| -------------------------------- | ----------------- |
| Agregar o quitar de la selección | `⇧` + clic        |
| Seleccionar los hijos            | `Enter`           |
| Seleccionar el padre             | `Esc` o `⇧ Enter` |
| Siguiente / anterior hermano     | `Tab` / `⇧ Tab`   |
| Siguiente pantalla (sin nodo)    | `Tab`             |
| Seleccionar todos los hermanos   | `Ctrl/⌘ A`        |

| Edición                      | Atajo                         |
| ---------------------------- | ----------------------------- |
| Copiar / cortar / pegar      | `Ctrl/⌘ C` / `X` / `V`        |
| Duplicar                     | `Ctrl/⌘ D`                    |
| Envolver en un contenedor    | `Ctrl/⌘ G` (o `Ctrl/⌘ Alt G`) |
| Desenvolver                  | `Ctrl/⌘ ⇧ G`                  |
| Mover el nodo arriba / abajo | `Alt ↑/↓` o `Ctrl/⌘ [ / ]`    |
| Eliminar                     | `⌫`                           |

| General                | Atajo                     |
| ---------------------- | ------------------------- |
| Paleta de comandos     | `Ctrl/⌘ K`                |
| Ajustes                | `Ctrl/⌘ ,`                |
| Guardar / Guardar como | `Ctrl/⌘ S` / `Ctrl/⌘ ⇧ S` |
| Deshacer / Rehacer     | `Ctrl/⌘ Z` / `Ctrl/⌘ ⇧ Z` |
| Cambiar de pestaña     | `Ctrl/⌘ 1–9`              |
| Problemas              | `Ctrl/⌘ ⇧ M`              |

## Si algo falla

- **«El servicio local no está activo»:** comprueba que `pnpm dev` siga corriendo y pulsa **Reintentar** en Inicio.
- **«No se pudo guardar el archivo»:** abre **Problemas**. Si otro programa cambió el archivo, la plataforma te ofrece comparar, conservar tus cambios o recargar.
- **Un componente se ve como marcador:** su librería no tiene bundle (falta la fuente o un shim nativo). Revisa la fuente en **Ajustes**.
- **Pantalla estrecha:** con menos de 1024 px de ancho solo se muestra el lienzo; amplía la ventana para editar.
