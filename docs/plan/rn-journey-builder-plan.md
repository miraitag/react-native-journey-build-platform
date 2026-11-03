# Plan: RN Journey Builder

Plataforma web para construir journeys de React Native de forma visual (arrastrar y soltar), exportarlos a código y, a la inversa, importar repositorios existentes para convertirlos en journeys editables.

## 1. Objetivo y alcance

- Construir journeys de varias pantallas en un lienzo infinito, al estilo de Figma o Stitch, con componentes reales de las librerías que configure cada equipo.
- Trabajar con varios journeys y plantillas a la vez, cada uno en su pestaña, como en Figma o Adobe.
- Guardar cada journey como un archivo `.rnjb` legible, validado y versionado. La plataforma debe poder volver a abrirlo y reconstruirlo tal cual.
- **Exportar:** pasar de `.rnjb` a una feature library de React Native con Clean Architecture, siguiendo un perfil de exportación y validada con las skills de arquitectura y calidad.
- **Importar (ingeniería inversa):** pasar de un repositorio existente a `.rnjb`, sin perder código.
- **Recibir journeys y plantillas desde Bitbucket** como una fuente remota más, además de los archivos locales.
- Fase actual: web app para un solo usuario, con un servicio local. Electron, Expo, publicar en Bitbucket y un backend quedan para después (sección 21).

## 2. Principios de implementación (obligatorios)

1. **El rendimiento es requisito, no mejora.** Cada fase cumple los presupuestos de la sección 5. Si una funcionalidad los rompe, no se integra.
2. **Nada específico de un proyecto va en el código.** Nombres, versiones, rutas, sufijos, carpetas, sistema de diseño, dispositivos y patrón de formularios salen de _packs_ y _perfiles_ en JSON.
3. **Nada específico de una máquina va en el `.rnjb` ni en los packs.** Las rutas y las credenciales viven solo en la configuración local (sección 6.2).
4. **Nunca se inventan datos.** Si algo no está en un manifiesto, un pack o un perfil, la plataforma no lo supone. Muestra un error tipado `RNJB-xxx` con una acción para resolverlo. Esto incluye las especificaciones de los dispositivos.
5. **No se pierde código.** Lo que no se pueda representar visualmente se conserva como _bloque de código_ y se vuelve a exportar intacto.
6. **Exportar e importar son simétricos.** Cada artefacto tiene un _códec_ con dos funciones: `emit` (de documento a código) y `parse` (de código a documento). Siempre se cumple `parse(emit(x)) = x`.
7. **La salida es determinista.** El mismo documento, con el mismo perfil y la misma versión de la plataforma, produce los mismos bytes, tanto en el `.rnjb` como en el código exportado.
8. **La plataforma nunca ejecuta código ajeno.** La vista previa resuelve los valores con datos de ejemplo y no ejecuta código del documento. Los repositorios importados y las fuentes remotas solo se leen: no se instalan dependencias ni se ejecuta nada.
9. **El dominio es TypeScript puro y está detrás de puertos.** La web app, el servicio local y Electron solo cambian los adaptadores.
10. **Todo contrato JSON tiene `schemaVersion`, se valida con Zod y tiene migraciones.**

## 3. Glosario

| Término            | Definición                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey            | Unidad de trabajo. Equivale a **un** archivo `.rnjb` y a **una** feature library exportada.                                                                    |
| Plantilla          | Un `.rnjb` con `meta.kind = "template"` que sirve como punto de partida para crear journeys.                                                                   |
| Slug               | Identificador en kebab-case, por ejemplo `order-tracking`. De él se derivan todos los nombres (sección 9.2).                                                   |
| Pantalla           | Árbol de nodos que se muestra dentro de un marco de dispositivo.                                                                                               |
| Estado de pantalla | Variante de datos de una pantalla, como cargando, éxito, error o vacío, con sus datos de ejemplo.                                                              |
| Nodo               | Instancia de un componente, con sus props, layout y espaciado. Un bloque de código también es un nodo.                                                         |
| Valor de prop      | Valor tipado que se asigna a una prop (sección 9.4).                                                                                                           |
| Bloque de código   | Código TypeScript o TSX que se conserva tal cual. Se edita en Monaco y se exporta sin cambios.                                                                 |
| Librería           | Paquete npm que aporta componentes, hooks o tokens.                                                                                                            |
| Fuente de librería | De dónde obtiene cada máquina una librería: ruta local, repositorio git o registro npm.                                                                        |
| Espacio de trabajo | Carpeta local donde viven los journeys, las plantillas, los packs y la configuración del equipo.                                                               |
| Fuente remota      | Repositorio de Bitbucket (o de otro proveedor git) del que se reciben `.rnjb`, plantillas y packs, en modo solo lectura.                                       |
| Pack               | Unidad de extensión en JSON: librería, hooks, dispositivos, bloques o perfil.                                                                                  |
| Manifiesto         | Parte del pack de librería que describe sus componentes y hooks: props, variantes, reglas de anidación y enlace con formularios.                               |
| Perfil             | Convenciones en JSON más los códecs que traducen entre `.rnjb` y código.                                                                                       |
| Códec              | Par `emit`/`parse` para un tipo de artefacto: pantalla, view-model, schema, navigator, values, gateway, etc.                                                   |
| Servicio local     | Proceso Node en `127.0.0.1` que hace lo que el navegador no puede: acceder al disco, usar git, compilar librerías para web, analizar código y ejecutar checks. |

## 4. Arquitectura del monorepo

Monorepo con pnpm workspaces y Turborepo; TypeScript en modo estricto, ESLint, Prettier, lefthook y commitlint. Las versiones de las herramientas se fijan en el `package.json` de este repositorio.

| Paquete                       | Responsabilidad                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                    | La plataforma, con Vite y React 19.                                                                                           |
| `apps/local-service`          | Servicio local, con Fastify y worker threads.                                                                                 |
| `packages/core`               | Entidades, comandos, puertos y errores. No depende de React ni del navegador.                                                 |
| `packages/document-schema`    | Schema Zod del `.rnjb`, migraciones, serialización canónica y checksum.                                                       |
| `packages/pack-schema`        | Schemas Zod de todos los packs y de `rnjb.team.json`.                                                                         |
| `packages/registry`           | Carga, valida y combina los packs activos. Expone las consultas del catálogo.                                                 |
| `packages/preview-runtime`    | Host de render en iframe con react-native-web, chrome del sistema, registro de _shims_ y protocolo de mensajes con el editor. |
| `packages/ts-analysis`        | Programa TypeScript compartido con caché por hash de archivo. Lo usan el extractor y el importador.                           |
| `packages/manifest-extractor` | Extrae el manifiesto de una librería a partir de su punto de entrada `types` o `source`.                                      |
| `packages/profiles`           | Convenciones y códecs. Incluye el perfil por defecto.                                                                         |
| `packages/codegen`            | Motor de exportación: árbol virtual de archivos, formateo y merge de 3 vías.                                                  |
| `packages/importer`           | Motor de importación: detección del perfil, ejecución de los `parse` y reporte de cobertura.                                  |
| `packages/remote-sources`     | Adaptadores de fuentes remotas: interpretación de URLs (Bitbucket primero) y sincronización vía git.                          |
| `packages/ui`                 | Sistema de diseño propio de la plataforma (sección 10.1).                                                                     |
| `packages/i18n`               | Textos en español (por defecto) e inglés.                                                                                     |

Las decisiones de arquitectura (ADRs) se documentan en `docs/adr/`:

- formato `.rnjb`
- packs y perfiles
- códecs y round-trip
- servicio local y su seguridad
- render en iframe y chrome del sistema
- persistencia y pestañas
- merge de 3 vías
- fuentes remotas
- puertos para Electron

## 5. Rendimiento (transversal a todas las fases)

### 5.1 Presupuestos

Se miden en una máquina de referencia con el fixture `journey-50`: 50 pantallas de 200 nodos cada una.

| Interacción                                     | Presupuesto                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Carga inicial hasta poder interactuar           | < 2 s. JS inicial < 300 KB gzip, sin contar Monaco ni los bundles de librerías.      |
| Abrir un journey hasta ver el lienzo            | < 1 s, con miniaturas en caché.                                                      |
| Arrastrar, hacer zoom o desplazarse             | 60 fps, sin ningún frame de más de 16 ms.                                            |
| Cambiar una prop hasta verlo en la vista previa | < 50 ms.                                                                             |
| Cambiar la pantalla en edición o el dispositivo | < 200 ms.                                                                            |
| Cambiar de pestaña                              | < 300 ms; < 500 ms si la pestaña estaba descargada de memoria.                       |
| Guardar (borrador o archivo)                    | Ninguna tarea de más de 50 ms en el hilo principal.                                  |
| Exportar 50 pantallas                           | < 5 s, con progreso visible.                                                         |
| Importar un repositorio de 50 pantallas         | < 30 s la primera vez, con progreso. Las siguientes importaciones son incrementales. |
| Indexar el espacio de trabajo                   | < 1 s para 200 archivos, con índice incremental.                                     |

### 5.2 Técnicas obligatorias

- **Vista previa:** se renderiza en un iframe aislado. Solo la pantalla en edición de la pestaña activa está en vivo; las demás se muestran como miniaturas.
- **Estado de React:** selectores por nodo, _structural sharing_ (Immer), React Compiler y listas virtualizadas.
- **Fuera del hilo principal:**
  - En Web Workers: serialización, hash, generación de código y diff.
  - En worker threads del servicio local: análisis de código, compilación y git.
- **Caché:** todo resultado costoso se guarda con su hash de contenido como clave (miniaturas, bundles, manifiestos, análisis de archivos y clones remotos).
- **Carga diferida:** Monaco, los paneles y los bundles de componentes se cargan solo cuando se usan.

### 5.3 Control en CI

Una prueba de Playwright sobre `journey-50` mide las tareas largas y los tiempos de la tabla 5.1. Si se excede algún presupuesto, el build falla.

## 6. Espacio de trabajo, configuración y fuentes

### 6.1 Espacio de trabajo local

Es una carpeta que elige el usuario. Contiene solo datos compartibles, sin rutas locales ni credenciales.

```
rnjb.team.json                  # packs activos, librerías requeridas (package + rango), perfil por defecto, checks
packs/{libraries,hooks,devices,blocks,profiles}/
templates/<slug>/<slug>.rnjb    # plantillas, cada una con su carpeta assets/
journeys/<slug>/<slug>.rnjb     # journeys
journeys/<slug>/assets/         # imágenes del journey
.rnjb-cache/                    # miniaturas e índice; no se comparte
```

La carpeta puede versionarse en git por decisión del equipo, pero la plataforma no lo requiere.

### 6.2 Configuración local

Vive en `~/.rnjb/settings.json`, la gestiona el servicio local y nunca se versiona. Contiene:

- la ruta del espacio de trabajo;
- la fuente de cada librería;
- las fuentes remotas;
- la ruta de las skills;
- la carpeta de caché.

Se edita en **Ajustes**, con campos de texto y un botón **Examinar** para elegir carpetas.

### 6.3 Fuentes de librería

- `localPath`: carpeta local con el repositorio de la librería.
- `git`: URL más `ref` (rama, tag o commit). Solo se aceptan los esquemas `https` y `ssh`.
- `registry`: paquete más versión. Usa el `.npmrc` que ya tiene el desarrollador.

Al guardar una fuente se valida que:

- se pueda resolver;
- el `name` del paquete coincida;
- la versión cumpla el rango de `rnjb.team.json`;
- exista el punto de entrada.

Si falla alguna validación, se muestra un error `RNJB-1xx` con la acción a seguir.

### 6.4 Fuentes remotas (Bitbucket)

1. **Alta:** en **Ajustes > Fuentes remotas** el usuario agrega una o varias fuentes. Puede pegar una URL de navegación de Bitbucket (Cloud o Data Center); la plataforma la separa en remoto, `ref` y carpeta, y le muestra cada parte para que confirme o corrija.
2. **Sincronización:** el servicio local hace un clon superficial y disperso (`--depth 1`, `--filter=blob:none`, _sparse checkout_ de `*.rnjb`, `packs/` y `rnjb.team.json`) en la caché.
   - Usa las credenciales git que la máquina ya tiene (SSH o _credential helper_).
   - La plataforma no pide ni guarda tokens.
3. **Inicio:** los journeys y plantillas de cada fuente aparecen en una sección **Remotos**, con el nombre de la fuente y su `ref`.
4. **Abrir un elemento remoto:** se crea una copia local en el espacio de trabajo, vinculada a su origen mediante `provenance.remote` (remoto, `ref`, ruta y commit).
5. **Actualizaciones:** se buscan al iniciar y con la acción **Buscar actualizaciones**. Si el origen cambió, la copia muestra "Actualización disponible" con dos acciones:
   - **Comparar**;
   - **Reemplazar**, solo si no hay cambios locales.
6. **Solo lectura:** la plataforma no hace commit ni push. Publicar queda para después (sección 21).
7. **Proveedores:** cada proveedor es un adaptador que solo se encarga de interpretar las URLs. La sincronización es git estándar, así que cualquier remoto git funciona con su URL directa.

### 6.5 Cambios externos

Un _file watcher_ del servicio local detecta cambios en el espacio de trabajo (por ejemplo, después de un `git pull` del equipo):

- Si el journey abierto no tiene cambios locales, se recarga y se muestra un aviso.
- Si tiene cambios, se ofrece **Comparar**, **Conservar los míos** o **Recargar**.

### 6.6 Seguridad del servicio local

- Escucha solo en `127.0.0.1`, exige un token de sesión y valida los encabezados `Origin` y `Host` (protección contra DNS rebinding y CSRF).
- Solo accede a las rutas configuradas o elegidas explícitamente por el usuario.
- Los procesos externos (git, tsc, eslint) se lanzan con los argumentos en un arreglo, sin shell y con `--` antes de cualquier entrada del usuario.
- Toda ruta de escritura se normaliza y se rechaza si sale de la carpeta destino (protección contra _path traversal_). Esto incluye las rutas que vengan de un `.rnjb` o de una fuente remota.

### 6.7 Sin servicio local

La plataforma sigue funcionando con capacidades reducidas:

- Abre y guarda archivos sueltos con la File System Access API. En Chromium también puede abrir el espacio de trabajo como carpeta.
- Usa los manifiestos y bundles que ya estén en caché.
- Muestra como marcadores los componentes sin bundle.

La barra de estado indica qué funciones no están disponibles.

## 7. Packs

### 7.1 Pipeline de cada librería (en el servicio local)

1. **Resolver la fuente** (sección 6.3).
2. **Extraer el manifiesto** con `manifest-extractor`:
   - los componentes exportados desde el índice público;
   - las props, con tipo, si son opcionales y su valor por defecto cuando se pueda deducir;
   - las variantes, a partir de las props con uniones de literales;
   - una categoría sugerida según la carpeta;
   - la versión, tomada del `package.json`.
3. **Compilar para web:** con Vite en modo librería, alias `react-native` → `react-native-web` y los _shims_ que declara el pack.
   - `react`, `react-dom` y `react-native-web` se comparten como una sola instancia mediante import maps.
   - El resultado se guarda en caché con la clave `package@version + hash`.
4. **Servir el bundle** como ESM. El iframe de vista previa lo carga con `import()` solo cuando se usa uno de sus componentes.

### 7.2 Datos extraídos y datos curados

- Lo extraído automáticamente lleva `origin: "extracted"`.
- Lo que el equipo corrige lleva `origin: "curated"` y una nueva extracción no lo sobrescribe.
- Si una versión nueva de la librería agrega o quita props o componentes, los cambios se muestran en un diff para que el equipo los acepte o rechace.

### 7.3 Lo que el equipo define en un pack de librería

- **Reglas de anidación:** qué hijos acepta cada componente y dentro de qué contenedores puede ir.
- **Enlace con formularios:** qué props corresponden a `value`, `onChange`, `onBlur` y `error`.
- **Textos editables en el lienzo.**
- **Props de íconos** y el catálogo de íconos.
- **Plantilla de importación** que se usa en el código exportado.
- **Proveedor de tema**, con sus esquemas y variantes.
- **Tokens:** colores, tipografía y escala de espaciado.
- **Shims web** que necesita la librería.

### 7.4 Shims nativos

Hay un registro extensible de shims. El set inicial cubre los módulos nativos de las librerías iniciales (sección 7.6): gesture-handler, reanimated, worklets, screens, safe-area-context, svg, clipboard, share, view-shot y netinfo.

Si un componente necesita un shim que no existe, o falla al renderizar, se muestra como marcador con la insignia "vista aproximada". Aun así se puede editar y exportar.

### 7.5 Otros tipos de pack

| Pack         | Contenido                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks        | Nombre, ruta de import, librería, firma, si es un efecto y en qué capa se permite.                                                          |
| Dispositivos | Especificaciones de cada dispositivo y estilos de chrome del sistema (sección 12).                                                          |
| Bloques      | Grupos de nodos reutilizables, creados con **Guardar como bloque**. Se arrastran como una unidad y, al soltarlos, se copian con IDs nuevos. |
| Perfiles     | Convenciones y referencia a los códecs (sección 15).                                                                                        |

Las plantillas no son packs: son archivos `.rnjb` (sección 19.2).

Todos los packs se validan con `pack-schema`; si uno tiene un error, el mensaje indica la ruta exacta del campo.

### 7.6 Librerías iniciales

Se cargan con la acción **Ajustes > Equipo > Importar package.json**. Esta acción lee el `package.json` de una feature library y el de su app `example/`, y propone:

- las librerías de `rnjb.team.json`, con sus versiones;
- la plantilla de dependencias del perfil (`dependencies`, `devDependencies` y `peerDependencies` de la librería, y `dependencies` de `example/`).

Las versiones salen siempre de los archivos importados; nunca se fijan en el código.

Clasificación inicial, tomando como base los `package.json` de referencia:

| Rol en la plataforma                                  | Librerías                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Componentes en el catálogo                            | `react-native` (primitivas), `@acme/design-system`, `@acme/ui-kit`, `react-native-safe-area-context`                                                                                                                |
| Hooks                                                 | `react`, `react-native`, `@react-navigation/native`, `react-hook-form`, `react-native-safe-area-context`, `@react-native-community/netinfo`                                                                         |
| Navegación (códec del navigator)                      | `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/stack`                                                                                                                             |
| Formularios                                           | `react-hook-form`, `yup`, `@hookform/resolvers`                                                                                                                                                                     |
| Contratos y núcleo (contexts y API pública generados) | `@acme/core`, `@acme/module-contracts`, `react-native-module-contracts`                                                                                                                                             |
| Solo dependencias nativas (shims en la vista previa)  | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `react-native-screens`, `react-native-svg`, `react-native-share`, `react-native-view-shot`, `@react-native-clipboard/clipboard` |
| Solo en la app `example/`                             | Las demás dependencias del `package.json` de `example/`, que se copian tal cual a su plantilla.                                                                                                                     |

## 8. Formato `.rnjb`

- **Serialización:** JSON UTF-8 con claves ordenadas y nodos indexados por ID estable, para que los diffs sean mínimos.
- **Contenido:**
  - **Identificación:** `format: "rnjb"`, `formatVersion` y `meta`:
    - `kind`: `journey` o `template`;
    - nombre visible y `slug`;
    - fechas;
    - versión de la plataforma.
  - **Dependencias y perfil:** `libraries[]` (`package`, `version` y `packId`, sin rutas) y `profile` (`id` y `version`).
  - **`screens[]`:** cada pantalla tiene `rootId`, `nodes: Record<id, Node>`, `states[]` con sus datos de ejemplo y `logic`.
    - Cada `Node` tiene `ref {package, component, version, variant}`, `props` (valores de prop), `layout` y `spacing`.
  - **Navegación:** `connections`, cada una con el nodo que la dispara, la pantalla destino y los parámetros tipados.
  - **Formularios, datos y recursos:** `forms`, `data` (sección 14.3), `strings`, `assets` (rutas relativas a la carpeta `assets/`), `categories` y `board` (posiciones en el lienzo).
  - **`provenance` (opcional):**
    - `importedFrom`: repositorio, commit y perfil detectado, si el journey se importó;
    - `remote`: remoto, `ref`, ruta y commit, si llegó de una fuente remota.
  - **`integrity`:** SHA-256 de la serialización canónica, calculado sin este campo.
- **Al abrir un archivo:**
  1. Se valida con Zod.
  2. Se migra según `formatVersion`.
  3. Se verifica el checksum.
  4. Se resuelven las librerías con la configuración local.
- **Si algo falla al abrir:**
  - Si el archivo es de una versión más nueva que la plataforma, o el checksum no coincide, se abre en modo de recuperación de solo lectura.
  - Si una librería no se resuelve, el archivo se abre igual: sus nodos se muestran como marcadores y se ofrece configurar la fuente.

## 9. Modelo de edición

### 9.1 El layout es flexbox

Las pantallas son árboles con flexbox, igual que en React Native: la posición de cada nodo la determinan su orden y las propiedades de su contenedor. No hay posicionamiento libre como en Figma; `position: absolute` solo existe si el manifiesto del componente lo admite.

### 9.2 Nombres

1. **Slug:**
   - Lo escribe el usuario y debe cumplir `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, con entre 3 y 50 caracteres.
   - Es único en el espacio de trabajo.
   - Si el usuario escribe el prefijo, se elimina y se le avisa.
2. **Derivados:** los define el perfil mediante plantillas de nombre. En el perfil por defecto:

   | Derivado                                        | Plantilla                                                            | Ejemplo con `order-tracking`                  |
   | ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
   | Archivo                                         | `journeys/{slug}/{slug}.rnjb`                                        | `journeys/order-tracking/order-tracking.rnjb` |
   | Carpeta o repositorio                           | `react-native-{slug}`                                                | `react-native-order-tracking`                 |
   | Paquete npm                                     | `react-native-{slug}`                                                | `react-native-order-tracking`                 |
   | Componente público, navigator, context y params | `{Pascal}`, `{Pascal}Navigator`, `{Pascal}Context`, `{Pascal}Params` | `OrderTracking`, `OrderTrackingNavigator`…    |

3. **Vista previa:** el diálogo de creación muestra los nombres derivados en vivo.
4. **Renombrar:** se actualizan todos los derivados. Si el journey ya se exportó, se avisa que cambiará el nombre del paquete.

### 9.3 Estados de pantalla

- El perfil define los estados iniciales (`loading`, `success`, `error` y `empty`) y el usuario puede agregar más.
- Cada estado tiene datos de ejemplo para las variables enlazadas.
- El estado se cambia desde la barra de la vista previa.
- Al exportar, los estados generan el `UiState` y el estado inicial del view-model. Los datos de ejemplo no se exportan.

### 9.4 Valores de prop

| Tipo         | Ejemplo                                                            | Control en el inspector              | Exportación                            |
| ------------ | ------------------------------------------------------------------ | ------------------------------------ | -------------------------------------- |
| `literal`    | `true`, `'primary'`, `16`                                          | Switch, select o número              | Valor literal                          |
| `string`     | `strings.login.title`                                              | Texto, también editable en el lienzo | Referencia a `values/strings`          |
| `token`      | color, tipografía o espaciado                                      | Selector de tokens del pack          | Referencia al tema o a `values`        |
| `icon`       | ícono del catálogo                                                 | Selector de íconos                   | Uso del componente de íconos del pack  |
| `binding`    | `uiState.items`, un campo de formulario, un handler o un parámetro | Selector de origen                   | Expresión tipada                       |
| `expression` | código libre                                                       | Monaco                               | Se exporta tal cual (bloque de código) |

- Si un tipo no se reconoce, la prop se edita como `expression`.
- En la vista previa, `binding` y `expression` nunca se ejecutan: se resuelven con los datos de ejemplo del estado activo o, si no hay, con el valor por defecto del manifiesto.

## 10. Shell de la plataforma

### 10.1 Sistema de diseño propio (`packages/ui`)

- **Principio:** la interfaz es neutra para que el color lo aporte el contenido de la vista previa. Es el mismo enfoque de Figma y Adobe.
- **Base técnica:** Tailwind v4 con variables CSS y Radix UI. Los tokens se definen en OKLCH en tres niveles: primitivos, semánticos y de componente. No dependen de las librerías cargadas.
- **Paleta:**
  - **Neutros:** escala de 12 pasos de gris con un ligero tinte frío, para fondos, paneles, bordes y texto.
  - **Acento azul:** para la selección, el foco y las acciones primarias. No es rojo, así no se confunde con los errores ni con los colores de marca del contenido de la vista previa.
  - **Semánticos:** éxito (verde), advertencia (ámbar), error (rojo) e información (cian).
  - **Capas sobre el lienzo:**
    - selección: borde de acento de 1.5 px con halo;
    - hover: acento al 40 %;
    - zona válida para soltar: relleno de acento al 8 %;
    - zona inválida: color de error.

    Todas deben verse bien sobre contenido claro y oscuro.

- **Temas:**
  - Claro: lienzo gris claro para que las pantallas blancas resalten.
  - Oscuro: lienzo casi negro con paneles un paso más claros; la elevación se marca con bordes, no con sombras.
  - Por defecto se sigue el tema del sistema operativo.
- **Tipografía:**
  - Inter variable, servida localmente, en tamaños 11, 12, 13, 14, 16 y 20.
  - JetBrains Mono para código y valores numéricos.
- **Densidad y forma:**
  - Controles de 28 px (compactos) y 32 px.
  - Espaciado en múltiplos de 4 px.
  - Radios de 4, 6 y 8 px.
  - Íconos Lucide de 16 px.
- **Accesibilidad:**
  - Contraste AA: 4.5:1 en texto y 3:1 en componentes, verificado con una prueba automática sobre los tokens y con axe.
  - Foco siempre visible.
  - Se respeta `prefers-reduced-motion`.
- **Textos de la interfaz:** las acciones van en infinitivo y los mensajes explican qué pasó, por qué y qué hacer.

### 10.2 Estructura de la pantalla

- **Barra de pestañas:**
  - **Inicio** está siempre fija.
  - Cada journey o plantilla abierta tiene su pestaña, con su nombre y un indicador de cambios sin guardar.
  - Las plantillas llevan además la insignia "Plantilla".
- **Barra superior:** deshacer/rehacer, dispositivo, versión del sistema operativo, estado de pantalla, temas de la vista previa, estado de guardado, importar y exportar.
- **Panel izquierdo** con pestañas: Catálogo, Bloques, Capas, Pantallas, Datos y Papelera.
- **Centro:** el lienzo.
- **Panel derecho:** el inspector.
- **Panel inferior plegable, Problemas:**
  - Valida de forma continua y lista errores y advertencias por pantalla.
  - Al hacer clic en uno, lleva al nodo correspondiente.
  - Solo los errores bloquean la exportación.
- **Barra de estado:** muestra el estado del servicio local, de las librerías y de las fuentes remotas.

### 10.3 Productividad

- Paleta de comandos con Cmd/Ctrl+K.
- Atajos de teclado, con una hoja de ayuda que se abre con `?`.
- Cambiar de pestaña con Cmd/Ctrl+1…9.
- Selección múltiple.
- Copiar y pegar entre pantallas, pestañas y journeys.
- Duplicar, envolver en un contenedor y mover nodos con el teclado.

### 10.4 Avisos

Se muestran con Sonner, con un color distinto por tipo.

- Éxito, información y advertencia se cierran solos.
- Los errores se quedan hasta que el usuario los cierra.
- Se cierran deslizando o con un botón.
- Hay un máximo de 3 visibles a la vez y se anuncian con `aria-live`.
- Solo las acciones destructivas piden confirmación.

### 10.5 Errores

- Catálogo tipado `RNJB-xxx` con código, severidad, mensaje traducido y acción para recuperarse.
- Error boundaries en cuatro niveles: app, panel, pantalla y nodo.

### 10.6 Primer uso

Un asistente guía la configuración inicial en este orden:

1. Espacio de trabajo.
2. Importar el `package.json` del equipo (sección 7.6).
3. Fuentes de librerías.
4. Fuentes remotas (opcional).
5. Crear un journey desde una plantilla o importar un repositorio.

Cada panel vacío explica qué hacer.

### 10.7 Tamaños de pantalla

- ≥ 1280 px: experiencia completa.
- 1024–1279 px: paneles colapsables.
- < 1024 px: solo vista previa, con un aviso.

## 11. Editor de pantalla

1. **Render:**
   - La pantalla se dibuja en un iframe con `sandbox="allow-scripts"`, del tamaño lógico del dispositivo. Así react-native-web recibe las dimensiones reales.
   - El iframe informa la geometría de cada nodo mediante un protocolo de mensajes tipado.
   - La selección, los resaltados y las zonas de soltar se dibujan en una capa superpuesta del editor.
2. **Arrastrar y soltar** con dnd-kit sobre esa capa:
   - Se resaltan los contenedores válidos y una línea marca el punto de inserción.
   - En las zonas inválidas aparece el cursor de prohibido; la validez depende de las reglas de anidación.
   - También funciona con teclado.
3. **Catálogo:**
   - Se ve por categoría o por librería, con búsqueda y lista virtualizada.
   - Muestra la versión de cada componente y avisa si no coincide con la del documento.
   - Las variantes se pueden desplegar.
   - Admite categorías y subcategorías propias, con un máximo de 2 niveles validado en el dominio.
4. **Capas:** el árbol de nodos, sincronizado con la selección.
5. **Inspector:** pestañas Props, Layout y espaciado, Formulario, Lógica y Navegación. Cada control se genera según el tipo del valor de prop (sección 9.4).
6. **Edición en el lienzo:** con doble clic se editan los textos declarados como editables; el cambio se guarda en `strings`.
7. **Espaciado:** capas visuales de margin, padding y gap, con controles para arrastrar. Los valores se ajustan a la escala del pack; si el pack no tiene escala, son libres.
8. **Scroll:** el marco del dispositivo tiene scroll interno para revisar la pantalla completa.

## 12. Dispositivos y chrome del sistema

1. **Contenido del pack de dispositivos.** Cada dispositivo declara:
   - plataforma;
   - versiones de sistema operativo admitidas y la versión por defecto;
   - tamaño lógico y densidad;
   - radio de las esquinas;
   - recortes (notch, Dynamic Island o cámara perforada);
   - áreas seguras por orientación;
   - barra de estado e indicador de inicio o barra de navegación;
   - fuente de los datos y fecha de revisión.

   Los datos salen de las especificaciones oficiales del fabricante; nunca se estiman.

2. **Plegables:** un dispositivo puede declarar varias posturas (cerrado y abierto), cada una con sus segmentos de pantalla y su bisagra. La vista previa reparte el contenido según la postura activa. Esto cubre los Android plegables y el iPhone plegable.
3. **Set inicial:**
   - 5 iOS y 5 Android: los modelos más usados de las últimas 5 generaciones de cada plataforma.
   - El iPhone plegable más reciente.
   - El Android plegable más usado.
   - **Fuente de uso:** un mismo proveedor público de cuota de mercado por modelo que cubra iOS y Android, para que ambas listas sean comparables. El proveedor y la fecha de corte quedan registrados en el pack.
   - La lista se arma en F2 y se revisa cuando sale una nueva generación. Actualizarla solo cambia el pack, no el código.
4. **Chrome del sistema según la versión del SO:**
   - El dispositivo y la versión de sistema elegida determinan el estilo de la barra de estado, el indicador de inicio, el teclado y las barras de navegación nativas.
   - Los estilos se declaran como datos en el pack: Liquid Glass en iOS 26 o superior, el estilo anterior para versiones previas de iOS, y Material 3 o Material 3 Expressive en Android según la versión.
   - El chrome se dibuja dentro del iframe, encima del contenido, para que el efecto de vidrio (desenfoque y translucidez con `backdrop-filter`) deje ver el contenido real al hacer scroll.
   - Es una aproximación visual, marcada con la insignia "vista aproximada".
5. **Selector de vista:** dispositivo, versión del sistema, orientación, postura y modo claro u oscuro del sistema. Son preferencias de la pestaña: no modifican el documento.
6. **Comparar dispositivos:**
   - Muestra la misma pantalla en hasta 3 dispositivos a la vez.
   - Solo el principal se actualiza en vivo; los demás se actualizan 300 ms después de dejar de editar.

## 13. Lienzo de journeys

1. Se construye con @xyflow/react: cada pantalla es un nodo y cada conexión es una navegación.
2. Solo se renderizan las pantallas visibles. Con zoom lejano se muestran miniaturas, que se generan en momentos de inactividad y se guardan en caché por hash. Solo la pantalla en edición está en vivo.
3. **Modo Enfoque:** muestra una sola pantalla.
4. **Modo Prototipo:** permite navegar por el journey haciendo clic en los disparadores de cada conexión, dentro del marco del dispositivo.
5. Las pantallas se pueden crear, duplicar, renombrar, reordenar y eliminar, y se marca cuál es la inicial.

## 14. Formularios, lógica y datos

### 14.1 Formularios

- Se construyen con React Hook Form y Yup.
- Por cada campo se configura:
  - tipo;
  - si es obligatorio;
  - mínimo y máximo;
  - patrón;
  - mensajes, que se guardan en `strings`;
  - valor por defecto.
- El modo de validación por defecto lo define el perfil.
- Se soportan formularios estáticos y dinámicos.
- Cada campo se conecta con su componente según el enlace con formularios del pack.
- En la vista previa se puede simular el error de cada campo.

### 14.2 Lógica

- El panel **Lógica** de cada pantalla muestra una tarjeta por hook, con librería, versión, dependencias y enlaces, más un grafo de dependencias.
- El cuerpo de los efectos se edita en Monaco, que se carga solo cuando se necesita.
- Si un hook está en una capa no permitida por su pack, aparece un error en **Problemas**.

### 14.3 Datos

El panel **Datos** cubre lo que se exporta a las capas `domain` y `data`:

- los modelos de dominio, con sus campos y tipos;
- los métodos del gateway: nombre, modelo de entrada, modelo de salida, método HTTP y ruta.

Los mappers y la lógica que no se pueda representar visualmente se guardan como bloques de código.

## 15. Perfiles y códecs

- **Convenciones (JSON):**
  - estructura de carpetas;
  - sufijos y forma de escribir los nombres de archivo;
  - plantillas de nombres (sección 9.2);
  - ubicación de los valores;
  - patrón de formularios y modo de validación;
  - estados de pantalla iniciales;
  - versiones de dependencias y `peerDependencies`;
  - plantillas de `package.json` para la librería y para `example/`;
  - checks de calidad.
- **Códecs (TypeScript):**
  - Hay uno por tipo de artefacto, con `emit` y `parse`, y cada uno lee las convenciones del perfil.
  - Un perfil nuevo puede reutilizar los códecs existentes con otras convenciones o agregar códecs propios.
- **Perfil por defecto, "feature library":**
  - Sigue las reglas de las skills.
  - Genera `src/public` (API mínima) y `src/core/domain/{result,error}`.
  - En `src/private` genera `domain`, `data`, `presentation` (contexts, navigation y screens) y `values`.
  - Por cada pantalla genera: `.screen.tsx`, `.view-model.ts`, `<screen>.ui-state.ts` (con el `UiState`), ui-models, mappers, `.schema.ts` y `components/` con sus `.props.ts` (ADR 0010).
  - Los tipos `FormFields` de cada formulario se generan en `model/<name>.model.ts`, como indica la skill.
  - Si una pantalla supera los umbrales de `screen-decomposition-conventions`, se divide en componentes.

## 16. Exportación

1. **Motor:** corre en un Worker. Ejecuta los `emit` de cada códec sobre el documento, construye un árbol virtual de archivos y lo formatea con Prettier. Antes de empezar verifica que cada nodo y cada hook tengan un códec; si alguno no lo tiene, se detiene y los lista.
2. **Destino:**
   - Carpeta nueva o ZIP, con el proyecto completo o solo `src/`.
   - Repositorio existente, con merge de 3 vías.
3. **Merge de 3 vías:**
   - **Archivo de lock:** cada exportación escribe `.rnjb/export.lock.json` en el destino. Guarda el checksum del `.rnjb`, las versiones del perfil y de la plataforma, y el hash de cada archivo generado.
   - **Las tres versiones:**
     - **Base:** el archivo tal como estaba en el commit donde cambió el lock por última vez (`git show`).
     - **Nuestra:** lo que se acaba de generar.
     - **Suya:** lo que hay hoy en el repositorio.
   - **Casos sin base completa:**
     - Si el destino no es un repositorio git, se usan los hashes del lock: los archivos que no se tocaron a mano se actualizan y los demás se comparan a 2 vías.
     - Si el journey se importó y aún no tiene lock, la primera exportación se compara a 2 vías contra el commit de `provenance.importedFrom`.
   - **Revisión antes de escribir:**
     - Se muestra un diff por archivo en el editor de diff de Monaco.
     - Cada conflicto se resuelve con nuestra versión, la suya o editándolo a mano.
     - Solo se escriben los archivos que cambiaron, y solo después de que el usuario confirme.
     - Si el repositorio tiene cambios sin commit, se avisa antes de escribir.
4. **Validación de calidad:**
   - El servicio local ejecuta los checks del perfil. En el perfil por defecto son los scanners de las skills, tsc y eslint.
   - Se corren solo sobre la carpeta elegida y solo cuando el usuario lo pide.
   - El resultado se muestra como un reporte.
5. **Destino como puerto:** el primero es React Native CLI; Expo vendrá después.

## 17. Importación desde un repositorio (ingeniería inversa)

1. **Entrada:** una carpeta local (con **Examinar**) o una URL git con su `ref`, incluidas las URLs de Bitbucket, que se interpretan igual que en la sección 6.4. El repositorio solo se analiza.
2. **Detección del perfil:**
   - Se compara la estructura del repositorio con los perfiles disponibles y se calcula una puntuación.
   - Si un perfil alcanza el umbral (70 % por defecto), el usuario lo confirma o elige otro.
   - Si ninguno lo alcanza, se usa el perfil por defecto y lo que no coincida queda como bloques de código.
3. **Análisis:** lo hace `ts-analysis` en worker threads, con caché por hash de archivo. Se ejecutan los `parse` en este orden:
   1. `package.json`: el slug (quitando el prefijo del perfil), las librerías y sus versiones. Las librerías que no tienen pack se ofrecen para configurar.
   2. Navigator y params: las pantallas, la pantalla inicial y los parámetros tipados.
   3. Llamadas a `navigate`: las conexiones, con su disparador cuando se puede ubicar.
   4. JSX de pantallas y componentes: los nodos de componentes registrados y sus valores de prop.
   5. Estilos: layout y espaciado. Los valores que coinciden con un token se convierten en token; los demás se conservan tal cual.
   6. Schemas, `FormFields` y `Controller`: los formularios.
   7. View-model y `UiState`: la lógica, los hooks y los estados de pantalla.
   8. `values/*`: strings, tokens, regex y fechas.
   9. `domain` y `data`: el panel **Datos**. Los cuerpos de los métodos se guardan como bloques de código.
   10. Lo que no se reconozca queda como bloque de código, con sus imports y su ubicación. Un archivo que no se entienda en absoluto se conserva completo.
4. **IDs deterministas:** se derivan de la ruta y de la posición en el AST, así que reimportar produce diffs mínimos.
5. **Reporte:** antes de crear el `.rnjb` se muestra:
   - la cobertura por pantalla (porcentaje de nodos visuales frente a bloques de código);
   - la lista de bloques de código;
   - las librerías que faltan;
   - las advertencias.

   El usuario confirma y el journey se guarda en `journeys/<slug>/` con `provenance.importedFrom`, y se abre en una pestaña.

6. **Garantía:** importar y luego exportar el mismo commit no pierde código. Cualquier diferencia se muestra en el diff de la sección 16 antes de escribir.

## 18. Persistencia, pestañas, historial y papelera

1. **Estado:**
   - Zustand con Immer; cada cambio genera parches.
   - Los parches alimentan el deshacer/rehacer (100 pasos por pestaña) y el guardado incremental.
2. **Guardado en dos niveles:**
   - **Borrador (IndexedDB con Dexie):** unos 800 ms después del último cambio se guardan los parches, que cada cierto número se consolidan en una copia completa. Protege contra cierres inesperados.
   - **Archivo `.rnjb`:** se escribe tras 5 s sin actividad, al cerrar la pestaña y con Cmd/Ctrl+S.
   - Ambos guardados automáticos están activos por defecto y se pueden desactivar.
   - El indicador de guardado muestra los dos, por ejemplo: "Borrador guardado · Archivo pendiente".
   - La serialización y el hash corren en un Worker. El guardado se fuerza cuando la ventana pasa a segundo plano.
3. **Pestañas:**
   - Cada pestaña guarda su propio documento, historial, selección y vista (dispositivo, zoom y estado).
   - Solo la pestaña activa monta el lienzo y el iframe. Las inactivas mantienen el documento en memoria sin renderizarlo.
   - Con más de 8 pestañas abiertas, las menos usadas se descargan de memoria: su documento y su historial pasan al borrador y se recargan al activarlas.
   - Un journey solo puede estar abierto en una pestaña: si ya está abierto, se enfoca esa pestaña. Entre ventanas del navegador, esto se controla con Web Locks y BroadcastChannel.
   - Al volver a abrir la plataforma se restauran las pestañas y sus borradores.
4. **Papelera:**
   - Eliminar mueve el elemento a la papelera con una fecha de vencimiento: 48 h por defecto, configurable a 24 h.
   - Aplica a nodos, pantallas, journeys y plantillas.
   - Si se elimina un journey o una plantilla, su archivo se quita del espacio de trabajo y la copia en la papelera permite restaurarlo.
   - La purga de vencidos corre al iniciar y cada hora.
   - Desde la bandeja se puede restaurar, vaciar o ver el tiempo restante de cada elemento.
5. **Archivos sueltos:**
   - Se abren con la File System Access API; en navegadores sin soporte, con descarga e `<input type=file>`.
   - También se pueden arrastrar a la ventana.
   - Instalada como PWA en Chromium, la plataforma se registra para abrir archivos `.rnjb`.

## 19. Inicio y plantillas

### 19.1 Pantalla de inicio

- **Secciones:** Recientes, Journeys, Plantillas y Remotos (agrupados por fuente).
- **Cada tarjeta muestra:**
  - miniatura, nombre y slug;
  - perfil y librerías;
  - fecha de modificación;
  - origen: local, importado o remoto, y si hay una actualización disponible.
- **Búsqueda y filtros:** por tipo, librería, perfil, origen y fecha.
- **Acciones:**
  - crear desde una plantilla;
  - importar un repositorio;
  - abrir un archivo suelto;
  - agregar una fuente remota;
  - continuar los borradores.
- **Índice:**
  - El servicio local lo mantiene de forma incremental, usando la fecha de modificación y el tamaño de cada archivo como clave.
  - Las miniaturas se guardan en `.rnjb-cache/`.

### 19.2 Plantillas

- **Origen:** pueden venir del espacio de trabajo (`templates/`), de una fuente remota o de la acción **Guardar como plantilla** en un journey. Esta acción copia el journey con IDs nuevos y sin `provenance`.
- **Edición:** una plantilla se abre en su propia pestaña, con la insignia "Plantilla", y se edita igual que un journey.
- **Crear desde una plantilla:** se pide el slug y se crea un journey nuevo con IDs nuevos.
- **Plantilla incluida:** la plataforma trae un "Journey básico" genérico como inicio recomendado.

## 20. Fases y dependencias

| Fase | Contenido                                                                                                          | Depende de                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| F0   | Monorepo, CI, ADRs, fixture `journey-50` y su prueba de rendimiento                                                | —                                           |
| F1   | Dominio, `.rnjb`, `pack-schema`, servicio local, espacio de trabajo, configuración e importación de `package.json` | F0                                          |
| F2   | Extracción de manifiestos, compilación web, `preview-runtime`, shims, pack de dispositivos y chrome del sistema    | F1                                          |
| F3   | `packages/ui` y el shell, con la barra de pestañas                                                                 | F0; en paralelo con F2                      |
| F4   | Editor de pantalla, estados de pantalla y valores de prop                                                          | F2, F3                                      |
| F5   | Persistencia, pestañas, historial y papelera                                                                       | F1; en paralelo con F4                      |
| F6   | Lienzo de journeys, modo Prototipo, Inicio, plantillas y fuentes remotas                                           | F4, F5                                      |
| F7   | Formularios, lógica y datos                                                                                        | F4                                          |
| F8   | Códecs `emit`, exportación, merge de 3 vías y checks                                                               | F6, F7. Los códecs pueden empezar desde F2. |
| F9   | Códecs `parse`, importación y reporte de cobertura                                                                 | F8                                          |
| F10  | Accesibilidad AA, guía de uso y optimización según 5.3                                                             | Todas                                       |

## 21. Futuro

- **Publicar en Bitbucket:** commit y push o pull request desde la plataforma, y un repositorio central de journeys.
- **Diff y merge semánticos de `.rnjb`:** incluido un _merge driver_ de git.
- **Electron:** con los mismos puertos; el servicio local pasa a ser el proceso principal y se asocia la extensión `.rnjb` en Windows y Mac.
- **Expo:** como destino de exportación.
- **Backend:** colaboración entre varios usuarios y comentarios sobre las pantallas.

## 22. Referencias (solo ejemplos, no normativas)

| Referencia                                    | Qué se tomó                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un sistema de diseño del equipo               | La forma de un pack de sistema de diseño: índice público, proveedor de tema con esquemas y variantes, tokens, escala de espaciado y catálogo de íconos. No tiene trato especial en el código. |
| Feature libraries de ejemplo (2 repositorios) | Los patrones del perfil por defecto y los `package.json` para las librerías iniciales (sección 7.6). También sirven como casos de prueba de la importación.                                   |
| Skills de arquitectura y calidad              | La fuente normativa de las convenciones y checks del perfil por defecto.                                                                                                                      |

## 23. Verificación

1. **Pruebas unitarias (Vitest):**
   - comandos, migraciones y checksum;
   - el límite de 2 niveles en categorías;
   - packs y `rnjb.team.json`;
   - reglas del slug y sus derivados;
   - interpretación de URLs de Bitbucket Cloud y Data Center;
   - importación de `package.json`.
2. **Pruebas de propiedad (fast-check):** `parse(emit(x)) = x` en cada códec, y serialización determinista.
3. **Ida y vuelta:** abrir y guardar un `.rnjb` sin cambios produce los mismos bytes.
4. **Exportación:**
   - snapshots por plantilla;
   - un mismo journey exportado con dos perfiles distintos;
   - merge de 3 vías: sin conflicto, con conflicto, destino que no es git y sin lock;
   - en CI, los exports de referencia pasan instalación, typecheck, lint y checks.
5. **Importación:** fixtures sintéticos en CI. Con los repositorios de ejemplo, de forma local y opcional: medir cobertura y verificar que importar y exportar no pierde código.
6. **Fuentes remotas:** con un remoto git local de prueba:
   - clon superficial y disperso;
   - detección de actualizaciones;
   - comparar y reemplazar;
   - verificar que no se guarda ningún token.
7. **Seguridad:**
   - se rechazan peticiones con `Origin` inválido o sin token;
   - se rechaza el path traversal desde un `.rnjb`, un códec o una fuente remota;
   - se rechazan esquemas de URL no permitidos;
   - la vista previa no ejecuta `expression`.
8. **Pruebas visuales (capturas con Playwright):**
   - chrome del sistema por versión de SO, incluido Liquid Glass;
   - posturas de plegables;
   - temas claro y oscuro de la plataforma.
   - Una sola línea base para macOS, Windows y Linux, sin contenedores: las capturas comparan formas y colores (los glifos se ocultan, porque cada SO rasteriza el texto distinto) y Chromium se lanza sin hinting, sin texto LCD y en sRGB. La geometría (pliegue, recortes, tamaños) se comprueba además con asserts que no dependen de capturas.
9. **Pruebas end-to-end (Playwright):**
   - soltar en zonas válidas e inválidas;
   - editar texto en el lienzo;
   - cambiar dispositivo, versión de SO y estado sin perder cambios;
   - 10 pestañas abiertas, con descarga de memoria y restauración del historial;
   - recargar la página y recuperar las pestañas y borradores;
   - papelera con el reloj simulado a +48 h;
   - abrir un archivo corrupto;
   - detectar un cambio externo con el watcher;
   - trabajar sin el servicio local.
10. **Rendimiento:** la prueba de 5.3 y mediciones con React Profiler.
11. **Prueba manual:** compilar el export en la app de ejemplo, en iOS y Android.

## 24. Decisiones tomadas

- **Unidad de trabajo:** 1 `.rnjb` = 1 journey = 1 feature library, identificado por un slug en kebab-case.
- **Nombre del paquete exportado:** `react-native-{slug}`. Es una convención del perfil por defecto, no está fija en el código.
- **Almacenamiento:** un espacio de trabajo local. Bitbucket es una fuente remota opcional, de solo lectura.
- **Interfaz:** pestañas por journey y plantilla, al estilo de Figma o Adobe, con descarga de memoria de las pestañas inactivas.
- **Importación:** cubre todas las capas; lo que no se puede mapear se conserva como bloque de código. Umbral de detección del perfil: 70 %, a calibrar con los ejemplos.
- **Exportación a un repositorio existente:** merge de 3 vías, con diff previo y confirmación del usuario.
- **Dispositivos:** los 5 más usados de las últimas 5 generaciones por plataforma, según una fuente pública de cuota de mercado común a ambas, más el iPhone plegable más reciente y el Android plegable más usado. El chrome del sistema depende de la versión de SO, incluido Liquid Glass en iOS 26 o superior.
- **Librerías iniciales:** salen de los `package.json` de referencia mediante **Importar package.json**.
- **Sistema de diseño de la plataforma:** neutro, con acento azul y tokens OKLCH, en tema claro y oscuro independientes del tema de la vista previa.
- **Formato:** `.rnjb` en JSON legible, validado con Zod, con checksum y migraciones.
- **Plataforma técnica:** web app con Vite más un servicio local en Node.
- **Extensibilidad:** packs versionados para librerías, hooks, dispositivos, bloques y perfiles.
- **Edición:**
  - layout con flexbox;
  - inspector a la derecha y edición de textos en el lienzo;
  - Monaco para expresiones y efectos;
  - vista previa aislada en un iframe, que no ejecuta código del documento.
- **Papelera:** 48 h por defecto, configurable a 24 h.
- **Usuarios:** un solo usuario.
- **Archivos del perfil por defecto:** el `UiState` va en `<screen>.ui-state.ts` y los `FormFields` en `model/<name>.model.ts`, como piden las skills (ADR 0010, que reemplaza la decisión original `.ui.state.ts`). Ambos se pueden cambiar en el perfil.

## 25. Pendientes

Ninguno. Las nuevas dudas que surjan durante la implementación se registran como ADR en `docs/adr/`.
