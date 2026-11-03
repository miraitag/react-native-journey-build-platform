# ADR 0010 — El perfil por defecto se valida con las skills

- Estado: aceptada (2026-11-02)
- Fase: F8 (códecs `emit`) y §16.4 (checks)

## Contexto

El plan dice que las skills de arquitectura y calidad son la fuente normativa del perfil por defecto (§22) y que sus escáneres son parte de los checks (§16.4). Al correr los escáneres reales sobre los exports de referencia, `tsc` y `eslint` pasaban, pero había 6 reglas de arquitectura y 6 de calidad con hallazgos.

Una de ellas chocaba con una decisión del plan (§24): el `UiState` iba en `<screen>.ui.state.ts`, y la regla `contexts-state-conventions` marca cualquier `*.state.ts` fuera de `contexts/state/`.

## Decisión

Cuando las skills y el plan se contradicen, mandan las skills. El generador se alineó regla por regla:

| Regla                                 | Antes                                         | Ahora                                                                                 |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `contexts-state-conventions`          | `<screen>.ui.state.ts`                        | `<screen>.ui-state.ts`, como nombra la regla del view-model                           |
| `presentation-view-model-conventions` | `use<Screen>ViewModel(params)`                | `use<Screen>ScreenViewModel()`; los params salen de `useRoute`                        |
| `public-api-conventions`              | `public/index.ts` exportaba el navigator      | `src/index.tsx` → `./public`; `public/` expone `<Feature>.tsx` y `<feature>-props.ts` |
| `forms-conventions`                   | `useForm(...)` sin tipo; librerías como peers | `useForm<<Feature>FormFields>`; RHF, Yup y resolvers en `dependencies`                |
| `schemas-conventions`                 | `yup.object` sin envolver; `STRINGS['a.b']`   | `createYupSchema<FormFields>(...)` en `presentation/schemas/`; `strings.a.b`          |
| `values-conventions`                  | `STRINGS` plano; `new RegExp` en el schema    | `strings` anidado por punto; patrones en `values/regex.ts`                            |
| `naming-conventions`                  | `domain/model/<x>.model.ts`, `X`              | `<x>.domain-model.ts`, `XDomainModel`                                                 |
| `domain-gateway-conventions`          | `Promise<X>`                                  | `Promise<Result<XDomainModel, ServiceError>>`, con `Result.success/failure`           |
| `styles-stylesheet-create`            | `style={{ … }}`                               | un `StyleSheet.create` por pantalla                                                   |
| `nav-stack-navigator`                 | `useNavigation()` sin tipo                    | `useNavigation<NativeStackNavigationProp<Params>>()` y `useRoute<RouteProp<…>>()`     |
| `ts-destructured-props`               | `props.route.params`, `params.x`              | sin props en la pantalla; `routeParams.x`                                             |
| `ts-alphabetical-properties`          | orden del documento                           | interfaces y tipos en orden alfabético                                                |
| `ts-react-fc`                         | `FC<Props>`                                   | función simple                                                                        |
| `conv-pnpm`                           | sin `.npmrc` ni `packageManager`              | ambos, desde la plantilla `packageJson` del perfil                                    |

`parse` lee la forma nueva y la anterior (`STRINGS`, `params`, estilos en línea), así que se pueden importar repositorios exportados antes.

## Verificación

`pnpm check:exports` exporta dos journeys de referencia, los instala y corre los checks del perfil: los dos escáneres de skills, `tsc` y `eslint`. Con las skills instaladas, los cuatro pasan. Los escáneres se buscan en `<proyecto>/.github/skills`, luego en la carpeta de Ajustes y por último en `~/.copilot/skills`, que son las ubicaciones del README de las skills. Si no están instalados, el check se informa como omitido, no como fallo.

## Consecuencias

- §24 (archivos del perfil por defecto) queda reemplazado por esta tabla.
- El sistema de diseño (por ejemplo `@acme/design-system`) entra por la plantilla de dependencias del equipo («Importar package.json»), no por el perfil.
- Cuando cambien las skills, este ADR y el generador se actualizan juntos; `check:exports` es la prueba.
