import {
  deriveNames,
  toCamelCase,
  toPascalCase,
  type CodeBlock,
  type ComponentNode,
  type DocumentNode,
  type FormField,
  type PropValue,
  type RnjbDocument,
  type Screen,
  type Spacing,
  type SpacingValue,
} from '@rnjb/core';
import { posix } from 'node:path';
import type { ProfilePack, TeamConfig } from '@rnjb/pack-schema';
import type { Files } from './plan.ts';

/**
 * `emit` half of the codecs (§16, ADR 0003). The default profile follows the team skills
 * (architecture and code quality), which are the normative source of its conventions (§22).
 */

export interface MissingCodec {
  kind: 'component' | 'hook';
  screen: string;
  name: string;
}

export interface EmitResult {
  files: Files;
  /** Nodes or hooks nothing can emit; the export must stop and list them (§16.1). */
  missing: MissingCodec[];
}

/** Libraries the skills require as runtime `dependencies` when a form uses them (forms rule). */
const FORM_RUNTIME = ['@hookform/resolvers', 'react-hook-form', 'yup'];

const slugOf = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'screen';

const q = (text: string): string =>
  `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;

/** JSX attributes cannot escape quotes, so awkward text goes in an expression. */
const attrString = (name: string, text: string): string =>
  /["\\\n]/.test(text) ? `${name}={${q(text)}}` : `${name}="${text}"`;
const isIdentifier = (text: string): boolean => /^[A-Za-z_$][\w$]*$/.test(text);
const keyOf = (key: string): string => (isIdentifier(key) ? key : q(key));
/** One property access: `root.key`, or `root['a.b']` when the key is not an identifier. */
const member = (root: string, key: string): string =>
  isIdentifier(key) ? `${root}.${key}` : `${root}[${q(key)}]`;
const access = (root: string, path: string): string =>
  path.split('.').filter(Boolean).reduce(member, root);
const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Names of each screen, made unique when two screens slug to the same text. */
function screenSlugs(screens: readonly Screen[]): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const screen of screens) {
    let slug = slugOf(screen.name);
    for (let n = 2; used.has(slug); n += 1) slug = `${slugOf(screen.name)}-${n}`;
    used.add(slug);
    result.set(screen.id, slug);
  }
  return result;
}

/** Module specifier from one generated file to another, both relative to the project root. */
export function importPath(fromFile: string, toFile: string): string {
  const relative = posix.relative(posix.dirname(fromFile), toFile.replace(/\.tsx?$/, ''));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

/** What every generated module needs to know about the project layout. */
interface Layout {
  values: string;
  /** Text keys that cannot nest (`a` and `a.b` both exist): they stay flat in `strings`. */
  flatStrings: ReadonlySet<string>;
}

/** The paths a screen's files live at, from the profile's folders and suffixes. */
interface ScreenPaths {
  screen: string;
  viewModel: string;
  uiState: string;
  schema: string;
  formModel: string;
  schemaHelper: string;
  navigator: string;
}

class Imports {
  private readonly named = new Map<string, Set<string>>();
  private readonly types = new Map<string, Set<string>>();
  private readonly lines = new Set<string>();

  /** `file` is where the imports are written. */
  constructor(
    private readonly file: string,
    private readonly layout: Layout,
  ) {}

  /** Imports `name` from another generated file, given by its path in the project. */
  local(toFile: string, name: string, typeOnly = false): void {
    (typeOnly ? this.addType : this.add).call(this, importPath(this.file, toFile), name);
  }

  /** The expression for a document text, importing `strings`. */
  string(key: string): string {
    this.local(`${this.layout.values}/strings.ts`, 'strings');
    return this.layout.flatStrings.has(key) ? member('strings', key) : access('strings', key);
  }

  tokens(): void {
    this.local(`${this.layout.values}/tokens.ts`, 'tokens');
  }

  regex(): void {
    this.local(`${this.layout.values}/regex.ts`, 'regex');
  }

  add(from: string, name: string): void {
    const set = this.named.get(from) ?? new Set<string>();
    set.add(name);
    this.named.set(from, set);
  }

  addType(from: string, name: string): void {
    const set = this.types.get(from) ?? new Set<string>();
    set.add(name);
    this.types.set(from, set);
  }

  raw(line: string): void {
    this.lines.add(line);
  }

  render(): string {
    const out: string[] = [];
    const sorted = (map: Map<string, Set<string>>) =>
      [...map].sort(([a], [b]) => a.localeCompare(b));
    for (const [from, names] of sorted(this.named))
      out.push(`import { ${[...names].sort(byName).join(', ')} } from ${q(from)};`);
    for (const [from, names] of sorted(this.types))
      out.push(`import type { ${[...names].sort(byName).join(', ')} } from ${q(from)};`);
    out.push(...[...this.lines].sort());
    return out.length > 0 ? `${out.join('\n')}\n\n` : '';
  }
}

// ---------------------------------------------------------------------------
// JSX and styles
// ---------------------------------------------------------------------------

/** `group` may itself be a path (`typography.heading`); names need not be identifiers. */
const tokenRef = (group: string, name: string): string =>
  `${access('tokens', group)}${isIdentifier(name) ? `.${name}` : `[${q(name)}]`}`;

function spacingValue(value: SpacingValue): string {
  return value.type === 'literal' ? String(value.value) : tokenRef(value.group, value.name);
}

/** Style entries of a node, or none; tokens are imported when used. */
function styleOf(node: ComponentNode, imports: Imports): string[] {
  const entries: string[] = [];
  const { layout, spacing } = node;
  for (const [key, value] of Object.entries(layout)) {
    if (value !== undefined)
      entries.push(`${key}: ${typeof value === 'number' ? value : q(value)}`);
  }
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  for (const kind of ['margin', 'padding'] as const) {
    const group: Spacing[typeof kind] = spacing[kind];
    for (const side of sides) {
      const value = group?.[side];
      if (value)
        entries.push(`${kind}${side[0]?.toUpperCase()}${side.slice(1)}: ${spacingValue(value)}`);
    }
  }
  if (spacing.gap) entries.push(`gap: ${spacingValue(spacing.gap)}`);
  if (entries.some((entry) => entry.includes('tokens.'))) imports.tokens();
  return entries;
}

const BINDING_ROOTS = {
  uiState: 'uiState',
  form: 'form',
  handler: 'handlers',
  param: 'routeParams',
} as const;

/**
 * JSX content for a text `children`, or `undefined` to keep it as an attribute. Plain text only
 * when JSX would read it back unchanged (no braces, tags, entities, line breaks or edge spaces);
 * otherwise a string expression.
 */
function childContent(value: PropValue, imports: Imports): string | undefined {
  if (value.type === 'string') return `{${imports.string(value.key)}}`;
  if (value.type !== 'literal' || typeof value.value !== 'string') return undefined;
  const text = value.value;
  return /^[^\s{}<>&]([^{}<>&\n]*[^\s{}<>&])?$/.test(text) && !/\s{2}/.test(text)
    ? text
    : `{${q(text)}}`;
}

function propOf(name: string, value: PropValue, imports: Imports): string {
  switch (value.type) {
    case 'literal':
      return typeof value.value === 'string'
        ? attrString(name, value.value)
        : `${name}={${JSON.stringify(value.value)}}`;
    case 'string':
      return `${name}={${imports.string(value.key)}}`;
    case 'token':
      imports.tokens();
      return `${name}={${tokenRef(value.group, value.name)}}`;
    case 'icon':
      return attrString(name, value.name);
    case 'binding':
      return `${name}={${access(BINDING_ROOTS[value.source], value.path)}}`;
    case 'expression':
      return `${name}={${value.code}}`;
  }
}

/** Styles go to one `StyleSheet.create` per screen (no inline style objects). */
class StyleSheetEntries {
  readonly entries: { key: string; body: string[] }[] = [];
  private readonly used = new Set<string>();

  add(node: ComponentNode, body: string[]): string {
    const base = toCamelCase(slugOf(node.name ?? node.ref.component)) || 'node';
    let key = base;
    for (let n = 2; this.used.has(key); n += 1) key = `${base}${n}`;
    this.used.add(key);
    this.entries.push({ key, body });
    return key;
  }
}

function emitNode(
  screen: Screen,
  id: string,
  imports: Imports,
  styles: StyleSheetEntries,
  missing: MissingCodec[],
  depth: number,
): string {
  const node: DocumentNode | undefined = screen.nodes[id];
  const pad = '  '.repeat(depth);
  if (!node) return '';
  if (node.kind === 'code') {
    for (const line of node.code.imports) imports.raw(line);
    return `${pad}{${node.code.source.trim()}}`;
  }

  const { component, package: pkg } = node.ref;
  if (!component || !pkg) {
    missing.push({ kind: 'component', screen: screen.name, name: node.name ?? node.id });
    return '';
  }
  imports.add(pkg, component);
  // A text `children` without child nodes is written as content: `<Text>Hola</Text>`.
  const { children: childrenProp, ...otherProps } = node.props;
  const content =
    node.children.length === 0 && childrenProp ? childContent(childrenProp, imports) : undefined;
  const attrs = Object.entries(content === undefined ? node.props : otherProps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => propOf(name, value, imports));
  const style = styleOf(node, imports);
  if (style.length > 0) attrs.push(`style={styles.${styles.add(node, style)}}`);
  const open = [component, ...attrs].join(' ');
  const children = node.children
    .map((child) => emitNode(screen, child, imports, styles, missing, depth + 1))
    .filter(Boolean);
  if (content !== undefined) return `${pad}<${open}>${content}</${component}>`;
  if (children.length === 0) return `${pad}<${open} />`;
  return `${pad}<${open}>\n${children.join('\n')}\n${pad}</${component}>`;
}

/** Binding roots the screen's JSX reads (`uiState`, `form`, `handlers`, `routeParams`). */
function rootsUsed(screen: Screen): string[] {
  const roots = new Set<string>();
  for (const node of Object.values(screen.nodes)) {
    if (node.kind !== 'component') continue;
    for (const value of Object.values(node.props))
      if (value.type === 'binding') roots.add(BINDING_ROOTS[value.source]);
  }
  return [...roots].sort(byName);
}

// ---------------------------------------------------------------------------
// Per-screen files
// ---------------------------------------------------------------------------

const blockImports = (imports: Imports, block: CodeBlock): void => {
  for (const line of block.imports) imports.raw(line);
};

const yupType = (field: FormField): string => {
  switch (field.type) {
    case 'number':
      return 'yup.number()';
    case 'boolean':
      return 'yup.boolean()';
    case 'date':
      return 'yup.date()';
    case 'email':
      return 'yup.string().email()';
    default:
      return 'yup.string()';
  }
};

const tsType = (field: FormField): string =>
  ({ number: 'number', boolean: 'boolean', date: 'Date' })[field.type as string] ?? 'string';

const sortedFields = (fields: readonly FormField[]) =>
  [...fields].sort((a, b) => byName(a.name, b.name));

const formNameOf = (name: string) => toPascalCase(slugOf(name));

function emitSchema(
  doc: RnjbDocument,
  screen: Screen,
  paths: ScreenPaths,
  layout: Layout,
): string | undefined {
  const forms = doc.forms.filter((form) => form.screenId === screen.id);
  if (forms.length === 0) return undefined;
  const imports = new Imports(paths.schema, layout);
  imports.raw("import * as yup from 'yup';");
  imports.local(paths.schemaHelper, 'createYupSchema');
  const message = (field: FormField, key: string): string => {
    const ref = field.messages[key];
    return ref ? imports.string(ref) : '';
  };
  const body = forms.map((form) => {
    const name = formNameOf(form.name);
    imports.local(paths.formModel, `${name}FormFields`, true);
    const fields = sortedFields(form.fields).map((field) => {
      let rule = yupType(field);
      if (field.required) {
        const text = message(field, 'required');
        rule += text ? `.required(${text})` : '.required()';
      }
      if (field.min !== undefined) {
        const text = message(field, 'min');
        rule += `.min(${field.min}${text ? `, ${text}` : ''})`;
      }
      if (field.max !== undefined) {
        const text = message(field, 'max');
        rule += `.max(${field.max}${text ? `, ${text}` : ''})`;
      }
      if (field.pattern) {
        imports.regex();
        const text = message(field, 'pattern');
        rule += `.matches(${access('regex', `${toCamelCase(slugOf(form.name))}.${field.name}`)}${text ? `, ${text}` : ''})`;
      }
      return `    ${keyOf(field.name)}: ${rule},`;
    });
    return `export const ${toCamelCase(slugOf(form.name))}Schema = createYupSchema<${name}FormFields>(\n  yup.object({\n${fields.join('\n')}\n  }),\n);\n`;
  });
  return `${imports.render()}${body.join('\n')}`;
}

/** `<Feature>FormFields`: the value shape shared by the schema and `useForm`. */
function emitFormModel(doc: RnjbDocument, screen: Screen): string | undefined {
  const forms = doc.forms.filter((form) => form.screenId === screen.id);
  if (forms.length === 0) return undefined;
  return forms
    .map((form) => {
      const fields = sortedFields(form.fields)
        .map((field) => `  ${keyOf(field.name)}${field.required ? '' : '?'}: ${tsType(field)};`)
        .join('\n');
      return `export interface ${formNameOf(form.name)}FormFields {\n${fields}\n}\n`;
    })
    .join('\n');
}

function handlerNames(screen: Screen): string[] {
  const names = new Set<string>();
  for (const node of Object.values(screen.nodes)) {
    if (node.kind !== 'component') continue;
    for (const value of Object.values(node.props))
      if (value.type === 'binding' && value.source === 'handler') names.add(value.path);
  }
  return [...names].sort();
}

interface RouteInfo {
  /** Route name of each screen, by screen id. */
  routes: Map<string, string>;
  /** Screens whose route receives params. */
  withParams: Set<string>;
  paramsType: string;
}

function emitViewModel(
  doc: RnjbDocument,
  screen: Screen,
  missing: MissingCodec[],
  paths: ScreenPaths,
  layout: Layout,
  route: RouteInfo,
): string {
  const routeName = route.routes.get(screen.id) as string;
  const imports = new Imports(paths.viewModel, layout);
  const hookLines: string[] = [];
  const setupLines: string[] = [];
  const returned = ['handlers', 'uiState'];
  const names = new Set([...returned, 'form', 'routeParams', 'navigation', 'route']);

  imports.add('react', 'useState');
  imports.local(paths.uiState, `${routeName}UiState`, true);

  const goTo = doc.connections
    .filter((connection) => connection.fromScreenId === screen.id)
    .map((connection) => {
      const target = route.routes.get(connection.toScreenId) ?? 'Screen';
      return {
        method: `goTo${target}`,
        target,
        params: route.withParams.has(connection.toScreenId),
      };
    });
  if (goTo.length > 0 || route.withParams.has(screen.id)) {
    imports.local(paths.navigator, route.paramsType, true);
  }
  if (goTo.length > 0) {
    imports.add('@react-navigation/native', 'useNavigation');
    imports.addType('@react-navigation/native-stack', 'NativeStackNavigationProp');
    setupLines.push(
      `  const navigation = useNavigation<NativeStackNavigationProp<${route.paramsType}>>();`,
    );
  }
  if (route.withParams.has(screen.id)) {
    imports.add('@react-navigation/native', 'useRoute');
    imports.addType('@react-navigation/native', 'RouteProp');
    setupLines.push(
      `  const { params: routeParams } = useRoute<RouteProp<${route.paramsType}, ${q(routeName)}>>();`,
    );
    returned.push('routeParams');
  }
  setupLines.push(
    `  const [uiState] = useState<${routeName}UiState>({ status: ${q(screen.states[0]?.name ?? 'success')} });`,
  );

  const forms = doc.forms.filter((form) => form.screenId === screen.id);
  const first = forms[0];
  if (first) {
    const camel = toCamelCase(slugOf(first.name));
    const fieldsType = `${formNameOf(first.name)}FormFields`;
    imports.add('react-hook-form', 'useForm');
    imports.add('@hookform/resolvers/yup', 'yupResolver');
    imports.local(paths.schema, `${camel}Schema`);
    imports.local(paths.formModel, fieldsType, true);
    const defaults = sortedFields(first.fields)
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => `${keyOf(field.name)}: ${JSON.stringify(field.defaultValue)}`);
    setupLines.push(
      `  const form = useForm<${fieldsType}>({`,
      ...(defaults.length > 0 ? [`    defaultValues: { ${defaults.join(', ')} },`] : []),
      `    mode: ${q(first.mode ?? 'onTouched')},`,
      `    resolver: yupResolver(${camel}Schema),`,
      `  });`,
    );
    returned.push('form');
  }

  // One variable per hook id, so dependencies point at the right one when a hook repeats.
  const variables = new Map<string, string>();
  for (const hook of screen.logic.hooks) {
    if (!hook.hook || !hook.library) continue;
    const base = `${toCamelCase(slugOf(hook.hook.replace(/^use/, '')))}Result`;
    let variable = base;
    for (let n = 2; names.has(variable); n += 1) variable = `${base}${n}`;
    names.add(variable);
    variables.set(hook.id, variable);
  }
  for (const hook of screen.logic.hooks) {
    if (!hook.hook || !hook.library) {
      missing.push({ kind: 'hook', screen: screen.name, name: hook.hook || hook.id });
      continue;
    }
    imports.add(hook.library, hook.hook);
    const variable = variables.get(hook.id) as string;
    const deps = hook.dependencies
      .filter((id) => !screen.logic.hooks.find((other) => other.id === id)?.body)
      .map((id) => variables.get(id))
      .filter((name) => name !== undefined);
    if (hook.body) {
      blockImports(imports, hook.body);
      hookLines.push(
        `  ${hook.hook}(() => {\n${hook.body.source
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n')}\n  }, [${deps.join(', ')}]);`,
      );
    } else {
      const args = Object.values(hook.bindings).join(', ');
      hookLines.push(`  const ${variable} = ${hook.hook}(${args});`);
      returned.push(variable);
    }
  }

  const handlerLines = [
    ...handlerNames(screen)
      .filter((name) => !goTo.some((entry) => entry.method === name))
      .map((name) => `    ${keyOf(name)}: () => undefined,`),
    ...goTo.map((entry) =>
      entry.params
        ? `    ${entry.method}: (nextParams: RouteProp<${route.paramsType}, ${q(entry.target)}>['params']) =>\n      navigation.navigate(${q(entry.target)}, nextParams),`
        : `    ${entry.method}: () => navigation.navigate(${q(entry.target)}),`,
    ),
  ].sort(byName);
  if (goTo.some((entry) => entry.params)) imports.addType('@react-navigation/native', 'RouteProp');
  const blocks = screen.logic.blocks.map((block) => {
    blockImports(imports, block);
    return block.source;
  });

  return `${imports.render()}${blocks.length > 0 ? `${blocks.join('\n\n')}\n\n` : ''}export function use${routeName}ScreenViewModel() {
${setupLines.join('\n')}
${hookLines.join('\n')}${hookLines.length > 0 ? '\n' : ''}  const handlers = {
${handlerLines.join('\n')}
  };

  return { ${returned.sort(byName).join(', ')} };
}
`;
}

function emitUiState(screen: Screen, pascal: string): string {
  const names = screen.states.length > 0 ? screen.states.map((state) => state.name) : ['success'];
  return `export type ${pascal}UiStatus = ${names.map(q).join(' | ')};\n\nexport interface ${pascal}UiState {\n  status: ${pascal}UiStatus;\n}\n`;
}

function emitScreen(
  screen: Screen,
  pascal: string,
  missing: MissingCodec[],
  paths: ScreenPaths,
  layout: Layout,
): string {
  const imports = new Imports(paths.screen, layout);
  const styles = new StyleSheetEntries();
  imports.local(paths.viewModel, `use${pascal}ScreenViewModel`);
  const body = emitNode(screen, screen.rootId, imports, styles, missing, 2);
  const roots = rootsUsed(screen);
  const viewModel =
    roots.length > 0
      ? `  const { ${roots.join(', ')} } = use${pascal}ScreenViewModel();`
      : `  use${pascal}ScreenViewModel();`;
  if (styles.entries.length > 0) imports.add('react-native', 'StyleSheet');
  const sheet =
    styles.entries.length > 0
      ? `\nconst styles = StyleSheet.create({\n${styles.entries
          .map(({ key, body: entries }) => `  ${key}: { ${entries.join(', ')} },`)
          .join('\n')}\n});\n`
      : '';
  return `${imports.render()}export function ${pascal}Screen() {
${viewModel}

  return (
${body || '    <></>'}
  );
}
${sheet}`;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

type TextTree = { [key: string]: TextTree | string };

/** Dotted keys nest (`errors.required` -> `strings.errors.required`); clashing ones stay flat. */
function stringsTree(strings: Record<string, string>): { tree: TextTree; flat: Set<string> } {
  const tree: TextTree = {};
  const flat = new Set<string>();
  for (const key of Object.keys(strings).sort()) {
    const parts = key.split('.');
    let level = tree;
    let clash = parts.some((part) => part === '');
    for (const part of parts.slice(0, -1)) {
      if (clash) break;
      const next = level[part];
      if (typeof next === 'string') clash = true;
      else level = next ?? (level[part] = {});
    }
    const last = parts.at(-1) as string;
    if (clash || level[last] !== undefined) flat.add(key);
    else level[last] = strings[key] as string;
  }
  for (const key of flat) tree[key] = strings[key] as string;
  return { tree, flat };
}

function renderTree(tree: TextTree, depth = 1): string {
  const pad = '  '.repeat(depth);
  return Object.keys(tree)
    .sort(byName)
    .map((key) => {
      const value = tree[key] as TextTree | string;
      return typeof value === 'string'
        ? `${pad}${keyOf(key)}: ${q(value)},`
        : `${pad}${keyOf(key)}: {\n${renderTree(value, depth + 1)}\n${pad}},`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/** Bare packages a generated file imports (`react`, `@scope/pkg`), not relative paths. */
function importedPackages(files: Files): string[] {
  const found = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    if (!/\.tsx?$/.test(path)) continue;
    for (const [, specifier] of text.matchAll(/from '([^.'][^']*)'/g)) {
      const parts = (specifier as string).split('/');
      found.add(parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string));
    }
  }
  return [...found].sort();
}

export interface EmitOptions {
  /** The team's dependency template (`rnjb.team.json`, §7.6); the profile's when absent. */
  dependencyTemplate?: TeamConfig['dependencyTemplate'];
}

/** A type text with the journey's model names turned into their `DomainModel` symbols. */
const domainTypes = (type: string, models: ReadonlyMap<string, string>): string =>
  type.replace(/\b[A-Za-z_]\w*\b/g, (word) => models.get(word) ?? word);

export function emitProject(
  doc: RnjbDocument,
  profile: ProfilePack,
  options: EmitOptions = {},
): EmitResult {
  const { folders, fileSuffixes: suffix } = profile.conventions;
  const names = deriveNames(doc.meta.slug, profile.conventions.nameTemplates);
  const files: Files = {};
  const missing: MissingCodec[] = [];
  const slugs = screenSlugs(doc.screens);
  const navigatorFile = `${folders.navigation}/${doc.meta.slug}.navigator.tsx`;
  const schemasDir = folders.schemas ?? `${posix.dirname(folders.screens as string)}/schemas`;
  const screenPaths = (slug: string): ScreenPaths => {
    const dir = `${folders.screens}/${slug}`;
    return {
      screen: `${dir}/${slug}${suffix.screen}`,
      viewModel: `${dir}/${slug}${suffix.viewModel}`,
      uiState: `${dir}/${slug}${suffix.uiState}`,
      schema: `${dir}/${slug}${suffix.schema}`,
      formModel: `${dir}/model/${slug}${suffix.model}`,
      schemaHelper: `${schemasDir}/create-yup.schema.ts`,
      navigator: navigatorFile,
    };
  };

  const { tree, flat } = stringsTree(doc.strings);
  const layout: Layout = { values: folders.values as string, flatStrings: flat };
  files[`${folders.values}/strings.ts`] =
    `export const strings = {\n${renderTree(tree)}\n} as const;\n`.replace('{\n\n}', '{}');

  type TokenTree = { [key: string]: TokenTree | string | number };
  const tokens: TokenTree = {};
  // Placeholders until the design system fills them in: a number where the token is spacing, so
  // the generated styles type-check, else the token's own name.
  const collect = (
    value: { type: string; group?: string; name?: string } | undefined,
    spacing = false,
  ): void => {
    if (value?.type !== 'token' || !value.group || !value.name) return;
    let level = tokens;
    for (const part of value.group.split('.').filter(Boolean)) {
      const next = level[part];
      level = typeof next === 'object' ? next : (level[part] = {});
    }
    if (spacing || typeof level[value.name] !== 'number')
      level[value.name] = spacing ? 0 : `${value.group}.${value.name}`;
  };
  for (const screen of doc.screens) {
    for (const node of Object.values(screen.nodes)) {
      if (node.kind !== 'component') continue;
      Object.values(node.props).forEach((value) => collect(value));
      [
        ...Object.values(node.spacing.margin ?? {}),
        ...Object.values(node.spacing.padding ?? {}),
        node.spacing.gap,
      ].forEach((value) => collect(value, true));
    }
  }
  const sortKeys = (tree: TokenTree): TokenTree =>
    Object.fromEntries(
      Object.keys(tree)
        .sort()
        .map((key) => {
          const value = tree[key] as TokenTree | string | number;
          return [key, typeof value === 'object' ? sortKeys(value) : value];
        }),
    );
  // JSON keys are always quoted, so names like `primary-500` stay valid TypeScript.
  files[`${folders.values}/tokens.ts`] =
    `// Token names used by the journey. Fill in the values from the design system.\nexport const tokens = ${JSON.stringify(sortKeys(tokens), null, 2)} as const;\n`;

  // Regular expressions live in values/regex.ts (values rule), one group per form.
  const patterns = doc.forms.flatMap((form) =>
    sortedFields(form.fields)
      .filter((field) => field.pattern)
      .map((field) => ({ form: toCamelCase(slugOf(form.name)), field })),
  );
  if (patterns.length > 0) {
    const groups = new Map<string, string[]>();
    for (const { form, field } of patterns)
      groups.set(form, [
        ...(groups.get(form) ?? []),
        `    ${keyOf(field.name)}: new RegExp(${q(field.pattern as string)}),`,
      ]);
    files[`${folders.values}/regex.ts`] = `export const regex = {\n${[...groups]
      .sort(([a], [b]) => byName(a, b))
      .map(([form, lines]) => `  ${form}: {\n${lines.join('\n')}\n  },`)
      .join('\n')}\n} as const;\n`;
  }

  // Core: Result and ServiceError, as the gateways return them (domain-gateway rule).
  const resultFile = `${folders.coreResult}/result.ts`;
  const errorFile = `${folders.coreError}/service-error.ts`;
  files[errorFile] =
    `export class ServiceError extends Error {\n  constructor(\n    readonly code: string,\n    message?: string,\n  ) {\n    super(message ?? code);\n  }\n}\n`;
  files[resultFile] =
    `import type { ServiceError } from ${q(importPath(resultFile, errorFile))};\n\nexport type Result<T, E = ServiceError> = { error: E; ok: false } | { ok: true; value: T };\n\nexport const Result = {\n  failure: <E>(error: E): Result<never, E> => ({ error, ok: false }),\n  success: <T>(value: T): Result<T, never> => ({ ok: true, value }),\n};\n`;

  // Domain models: `<name>.domain-model.ts` exporting `<Name>DomainModel` (naming rule).
  const domainModels = new Map(
    doc.data.models.map((model) => [
      toPascalCase(slugOf(model.name)),
      `${toPascalCase(slugOf(model.name))}DomainModel`,
    ]),
  );
  const modelFileOf = (name: string) =>
    `${folders.domain}/model/${slugOf(name)}${suffix.domainModel ?? suffix.model}`;
  for (const model of doc.data.models) {
    files[modelFileOf(model.name)] =
      `export interface ${domainModels.get(toPascalCase(slugOf(model.name)))} {\n${[...model.fields]
        .sort((a, b) => byName(a.name, b.name))
        .map((field) => `  ${field.name}${field.optional ? '?' : ''}: ${field.type};`)
        .join('\n')}\n}\n`;
  }
  if (doc.data.gateways.length > 0) {
    const pascal = toPascalCase(doc.meta.slug);
    const modelFiles = new Map(
      doc.data.models.map((model) => [
        domainModels.get(toPascalCase(slugOf(model.name))) as string,
        modelFileOf(model.name),
      ]),
    );
    const typed = (type: string) => domainTypes(type, domainModels);
    const used = doc.data.gateways.flatMap((method) => [
      typed(method.input ?? ''),
      typed(method.output),
    ]);
    const modelImport = (fromFile: string): string =>
      [...modelFiles]
        .filter(([name]) => used.some((type) => new RegExp(`\\b${name}\\b`).test(type)))
        .map(([name, file]) => `import type { ${name} } from ${q(importPath(fromFile, file))};\n`)
        .join('');
    const gatewayFile = `${folders.domain}/gateway/${doc.meta.slug}.gateway.ts`;
    const implFile = `${folders.data}/gateway/${doc.meta.slug}.gateway.impl.ts`;
    const signature = (method: (typeof doc.data.gateways)[number]) =>
      `${method.name}(${method.input ? `input: ${typed(method.input)}` : ''}): Promise<Result<${typed(method.output)}, ServiceError>>`;
    const methods = [...doc.data.gateways].sort((a, b) => byName(a.name, b.name));
    files[gatewayFile] =
      `${modelImport(gatewayFile)}import type { Result } from ${q(importPath(gatewayFile, resultFile))};\nimport type { ServiceError } from ${q(importPath(gatewayFile, errorFile))};\n\nexport interface ${pascal}Gateway {\n${methods
        .map((method) => `  ${signature(method)};`)
        .join('\n')}\n}\n`;
    files[implFile] =
      `${modelImport(implFile)}import { Result } from ${q(importPath(implFile, resultFile))};\nimport { ServiceError } from ${q(importPath(implFile, errorFile))};\nimport type { ${pascal}Gateway } from ${q(importPath(implFile, gatewayFile))};\n\nexport const create${pascal}Gateway = (baseUrl: string): ${pascal}Gateway => ({\n${methods
        .map((method) =>
          method.body
            ? `  ${method.name}: ${method.body.source.trim()},`
            : `  async ${signature(method)} {\n    const response = await fetch(\`\${baseUrl}${method.path}\`, {\n      method: ${q(method.httpMethod)},${method.input && method.httpMethod !== 'GET' ? '\n      body: JSON.stringify(input),' : ''}\n    });\n    if (!response.ok) return Result.failure(new ServiceError(String(response.status)));\n    return Result.success((await response.json()) as ${typed(method.output)});\n  },`,
        )
        .join('\n')}\n});\n`;
  }

  // Routes: one per screen, and which of them take params.
  const routes = new Map(
    doc.screens.map((screen) => [screen.id, toPascalCase(slugs.get(screen.id) as string)]),
  );
  const routeParamsOf = (screenId: string) =>
    doc.connections.find((connection) => connection.toScreenId === screenId)?.params ?? [];
  const route: RouteInfo = {
    routes,
    withParams: new Set(
      doc.screens.filter((screen) => routeParamsOf(screen.id).length > 0).map((s) => s.id),
    ),
    paramsType: names.params as string,
  };

  // Screens.
  if (doc.forms.length > 0) {
    files[`${schemasDir}/create-yup.schema.ts`] =
      `import type * as yup from 'yup';\n\n/** Types a schema with its form fields model (schemas rule). */\nexport const createYupSchema = <T extends object>(schema: yup.ObjectSchema<T>) => schema;\n`;
  }
  for (const screen of doc.screens) {
    const slug = slugs.get(screen.id) as string;
    const pascal = toPascalCase(slug);
    const paths = screenPaths(slug);
    files[paths.screen] = emitScreen(screen, pascal, missing, paths, layout);
    files[paths.viewModel] = emitViewModel(doc, screen, missing, paths, layout, route);
    files[paths.uiState] = emitUiState(screen, pascal);
    const schema = emitSchema(doc, screen, paths, layout);
    if (schema) files[paths.schema] = schema;
    const model = emitFormModel(doc, screen);
    if (model) files[paths.formModel] = model;
  }

  // Navigation.
  const typeOfRoute = (screenId: string): string => {
    const params = [...routeParamsOf(screenId)].sort((a, b) => byName(a.name, b.name));
    if (params.length === 0) return 'undefined';
    return `{ ${params.map((param) => `${param.name}${param.optional ? '?' : ''}: ${param.type}`).join('; ')} }`;
  };
  const initial =
    doc.screens.find((screen) => screen.id === doc.board.initialScreenId) ?? doc.screens[0];
  const byRoute = [...doc.screens].sort((a, b) =>
    byName(routes.get(a.id) as string, routes.get(b.id) as string),
  );
  files[navigatorFile] =
    `import { createNativeStackNavigator } from '@react-navigation/native-stack';
${doc.screens
  .map((screen) => {
    const slug = slugs.get(screen.id) as string;
    return `import { ${toPascalCase(slug)}Screen } from ${q(importPath(navigatorFile, screenPaths(slug).screen))};`;
  })
  .join('\n')}

export type ${names.params} = {
${byRoute.map((screen) => `  ${routes.get(screen.id)}: ${typeOfRoute(screen.id)};`).join('\n')}
};

const Stack = createNativeStackNavigator<${names.params}>();

export function ${names.navigator}() {
  return (
    <Stack.Navigator${initial ? ` initialRouteName=${q(routes.get(initial.id) as string)}` : ''}>
${doc.screens
  .map((screen) => {
    const pascal = routes.get(screen.id) as string;
    return `      <Stack.Screen name=${q(pascal)} component={${pascal}Screen} />`;
  })
  .join('\n')}
    </Stack.Navigator>
  );
}
`;

  // Public API (public-api rule): the root barrel re-exports `public`, which exposes only the
  // feature component and its props; the component composes the navigator.
  const publicDir = folders.public as string;
  const rootIndex = `${posix.dirname(publicDir)}/index.tsx`;
  const componentFile = `${publicDir}/${names.component}.tsx`;
  const propsFile = `${publicDir}/${doc.meta.slug}-props.ts`;
  const publicIndex = `${publicDir}/index.ts`;
  files[rootIndex] =
    `export * from ${q(importPath(rootIndex, `${publicDir}/index.ts`).replace(/\/index$/, ''))};\n`;
  files[propsFile] =
    `/** What the host app passes to ${names.component}. */\nexport type ${names.props as string} = Record<string, never>;\n`;
  // A plain function, not React.FC (ts-react-fc rule); the props type stays the host contract.
  files[componentFile] =
    `import { ${names.navigator} } from ${q(importPath(componentFile, navigatorFile))};\n\nexport function ${names.component}() {\n  return <${names.navigator} />;\n}\n`;
  files[publicIndex] =
    `export { ${names.component} } from ${q(importPath(publicIndex, componentFile))};\nexport type { ${names.props as string} } from ${q(importPath(publicIndex, propsFile))};\n`;

  // Packages the code imports: form libraries are runtime dependencies (forms rule), the rest
  // peers, at the journey's version when it has one.
  const template = options.dependencyTemplate?.library ?? profile.conventions.packageJson.library;
  const { packageManager, npmrc } = profile.conventions.packageJson.library;
  const versionOf = (pkg: string) =>
    doc.libraries.find((library) => library.package === pkg)?.version ?? '*';
  const imported = importedPackages(files);
  const pick = (runtime: boolean) =>
    Object.fromEntries(
      imported
        .filter((pkg) => FORM_RUNTIME.includes(pkg) === runtime)
        .map((pkg) => [pkg, versionOf(pkg)]),
    );
  files['package.json'] = `${JSON.stringify(
    {
      name: names.package,
      version: '0.1.0',
      main: rootIndex,
      ...(packageManager ? { packageManager } : {}),
      dependencies: { ...pick(true), ...template.dependencies },
      devDependencies: template.devDependencies,
      peerDependencies: {
        ...pick(false),
        ...Object.fromEntries(doc.libraries.map((library) => [library.package, library.version])),
        ...template.peerDependencies,
      },
    },
    null,
    2,
  )}\n`;
  if (npmrc && npmrc.length > 0) files['.npmrc'] = `${npmrc.join('\n')}\n`;

  return { files, missing };
}
