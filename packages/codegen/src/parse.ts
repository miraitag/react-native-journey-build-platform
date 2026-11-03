import {
  escapeRegExp,
  toPascalCase,
  type Connection,
  type DocumentNode,
  type DomainModel,
  type CodeBlock,
  type Layout,
  type PropValue,
  type Screen,
  type Spacing,
  type SpacingValue,
} from '@rnjb/core';
import type { ProfilePack } from '@rnjb/pack-schema';
import { ts } from '@rnjb/ts-analysis';
import type { Files } from './plan.ts';

/**
 * `parse` half of the codecs (§17, ADR 0003): rebuilds what `emitProject` writes. Anything it
 * does not rebuild is kept whole as a code block, never dropped.
 */

export interface ParsedProject {
  screens: Screen[];
  connections: Connection[];
  strings: Record<string, string>;
  models: DomainModel[];
  blocks: CodeBlock[];
  initialScreenId?: string;
  /** Library package -> version range, from `package.json`, for the packages the JSX uses. */
  libraries: Record<string, string>;
}

export interface ImportReport {
  screens: { name: string; components: number; codeBlocks: number; coverage: number }[];
  /** Files kept whole as code blocks (§17.3.10). */
  keptWhole: string[];
}

const LAYOUT_KEYS = new Set([
  'flexDirection',
  'justifyContent',
  'alignItems',
  'alignSelf',
  'flexWrap',
  'flex',
  'flexGrow',
  'flexShrink',
  'width',
  'height',
  'position',
]);
const ROOTS = {
  uiState: 'uiState',
  form: 'form',
  handlers: 'handler',
  routeParams: 'param',
  params: 'param',
} as const;
/** The texts object, as written now and by earlier exports. */
const STRINGS_ROOTS = new Set(['strings', 'STRINGS']);
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

const source = (path: string, text: string) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

const unquote = (expr: ts.Expression): string | undefined =>
  ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ? expr.text : undefined;

/** `a.b['c']` -> ['a', 'b', 'c'] */
function chain(expr: ts.Expression): string[] | undefined {
  if (ts.isIdentifier(expr)) return [expr.text];
  if (ts.isPropertyAccessExpression(expr)) {
    const head = chain(expr.expression);
    return head && [...head, expr.name.text];
  }
  if (ts.isElementAccessExpression(expr)) {
    const head = chain(expr.expression);
    const key = unquote(expr.argumentExpression);
    return head && key !== undefined ? [...head, key] : undefined;
  }
  return undefined;
}

function literal(expr: ts.Expression): string | number | boolean | null | undefined {
  const text = unquote(expr);
  if (text !== undefined) return text;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  )
    return -Number(expr.operand.text);
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null;
  return undefined;
}

/** JSX text as React reads it: lines trimmed at their joins, blank lines dropped, joined by a space. */
function jsxText(node: ts.JsxText): string {
  const lines = node.text.split(/\r?\n/);
  if (lines.length === 1) return node.text;
  return lines
    .map((line, index) =>
      index === 0 ? line.trimEnd() : index === lines.length - 1 ? line.trimStart() : line.trim(),
    )
    .filter(Boolean)
    .join(' ');
}

/** A text `children` value: a string literal or a document string; anything else stays code. */
const textValue = (value: PropValue): PropValue | undefined =>
  (value.type === 'literal' && typeof value.value === 'string') || value.type === 'string'
    ? value
    : undefined;

function propValue(expr: ts.Expression): PropValue {
  const value = literal(expr);
  if (value !== undefined) return { type: 'literal', value };
  const path = chain(expr);
  if (path && path.length >= 2) {
    const [root, ...rest] = path as [string, ...string[]];
    if (STRINGS_ROOTS.has(root)) return { type: 'string', key: rest.join('.') };
    if (root === 'tokens' && rest.length >= 2)
      return { type: 'token', group: rest.slice(0, -1).join('.'), name: rest.at(-1) as string };
    if (root in ROOTS)
      return {
        type: 'binding',
        source: ROOTS[root as keyof typeof ROOTS],
        path: rest.join('.'),
      };
  }
  return { type: 'expression', code: expr.getText() };
}

function spacingValue(expr: ts.Expression): SpacingValue | undefined {
  if (ts.isNumericLiteral(expr)) return { type: 'literal', value: Number(expr.text) };
  const path = chain(expr);
  return path && path.length >= 3 && path[0] === 'tokens'
    ? { type: 'token', group: path.slice(1, -1).join('.'), name: path.at(-1) as string }
    : undefined;
}

function readStyle(object: ts.ObjectLiteralExpression): { layout: Layout; spacing: Spacing } {
  const layout: Record<string, unknown> = {};
  const spacing: Spacing = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = property.name.getText();
    const initializer = property.initializer;
    if (LAYOUT_KEYS.has(key)) {
      const value = literal(initializer);
      if (typeof value === 'string' || typeof value === 'number') layout[key] = value;
      continue;
    }
    const value = spacingValue(initializer);
    if (!value) continue;
    if (key === 'gap') spacing.gap = value;
    for (const kind of ['margin', 'padding'] as const) {
      const side = SIDES.find(
        (candidate) => key === `${kind}${candidate[0]?.toUpperCase()}${candidate.slice(1)}`,
      );
      if (side) (spacing[kind] ??= {})[side] = value;
    }
  }
  return { layout: layout as Layout, spacing };
}

type JsxNode = ts.JsxElement | ts.JsxSelfClosingElement;
const isJsx = (node: ts.Node): node is JsxNode =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);

function screenJsx(file: ts.SourceFile): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text.endsWith('Screen') && node.body) {
      const ret = node.body.statements.find(ts.isReturnStatement);
      let expr = ret?.expression;
      while (expr && ts.isParenthesizedExpression(expr)) expr = expr.expression;
      found = expr;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function parseScreenNodes(
  screenId: string,
  file: ts.SourceFile,
  libraries: Record<string, string>,
  used: Record<string, string>,
): { nodes: Record<string, DocumentNode>; rootId: string } {
  const packages = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const from = statement.moduleSpecifier.text;
    if (from.startsWith('.')) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements) packages.set(element.name.text, from);
  }

  // `const styles = StyleSheet.create({ key: { ... } })`: the styles nodes point at.
  const sheet = new Map<string, ts.ObjectLiteralExpression>();
  const create = findCall(file, (node) =>
    ts.isCallExpression(node) &&
    node.expression.getText() === 'StyleSheet.create' &&
    node.arguments[0] &&
    ts.isObjectLiteralExpression(node.arguments[0])
      ? node.arguments[0]
      : undefined,
  );
  for (const property of create?.properties ?? [])
    if (ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer))
      sheet.set(property.name.getText(), property.initializer);

  const nodes: Record<string, DocumentNode> = {};
  let counter = 0;
  const nextId = () => `${screenId}.n${counter++}`;

  const codeText = (source: string): string => {
    const id = nextId();
    nodes[id] = { id, kind: 'code', code: { language: 'tsx', source, imports: [] }, children: [] };
    return id;
  };

  const code = (expr: ts.Node): string => {
    const id = nextId();
    nodes[id] = {
      id,
      kind: 'code',
      code: { language: 'tsx', source: expr.getText(), imports: [] },
      children: [],
    };
    return id;
  };

  const element = (jsx: JsxNode): string => {
    const opening = ts.isJsxElement(jsx) ? jsx.openingElement : jsx;
    const tag = opening.tagName.getText();
    const id = nextId();
    const pkg = packages.get(tag);
    if (pkg) used[pkg] = libraries[pkg] ?? '*';
    const props: Record<string, PropValue> = {};
    let layout: Layout = {};
    let spacing: Spacing = {};
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue;
      const name = attribute.name.getText();
      const init = attribute.initializer;
      const styleExpr =
        name === 'style' && init && ts.isJsxExpression(init) ? init.expression : undefined;
      const styleObject =
        styleExpr && ts.isObjectLiteralExpression(styleExpr)
          ? styleExpr
          : styleExpr && ts.isPropertyAccessExpression(styleExpr)
            ? sheet.get(styleExpr.name.text)
            : undefined;
      if (styleObject) {
        ({ layout, spacing } = readStyle(styleObject));
      } else if (!init) props[name] = { type: 'literal', value: true };
      else if (ts.isStringLiteral(init)) props[name] = { type: 'literal', value: init.text };
      else if (ts.isJsxExpression(init) && init.expression)
        props[name] = propValue(init.expression);
    }
    const children: string[] = [];
    if (ts.isJsxElement(jsx)) {
      const meaningful = jsx.children.filter(
        (child) =>
          !(ts.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces) &&
          !(ts.isJsxExpression(child) && !child.expression),
      );
      const [only] = meaningful;
      const asText =
        meaningful.length === 1 && only && !('children' in props)
          ? ts.isJsxText(only)
            ? ({ type: 'literal', value: jsxText(only) } as const)
            : ts.isJsxExpression(only) && only.expression
              ? textValue(propValue(only.expression))
              : undefined
          : undefined;
      // `<Text>Hola</Text>` keeps its text as the `children` prop, as the editor shows it.
      if (asText) props['children'] = asText;
      else
        for (const child of meaningful) {
          if (isJsx(child)) children.push(element(child));
          else if (ts.isJsxExpression(child) && child.expression)
            children.push(code(child.expression));
          // Text mixed with elements is kept as a string block, never dropped (§2.5).
          else if (ts.isJsxText(child)) children.push(codeText(JSON.stringify(jsxText(child))));
        }
    }
    nodes[id] = {
      id,
      kind: 'component',
      ref: { package: pkg ?? '', component: tag, version: (pkg && libraries[pkg]) || '*' },
      props,
      children,
      layout,
      spacing,
    };
    return id;
  };

  const root = screenJsx(file);
  const rootId = root && isJsx(root) ? element(root) : code(root ?? file);
  return { nodes, rootId };
}

/** `{ errors: { required: 'x' } }` -> `{ 'errors.required': 'x' }`; flat quoted keys stay as they are. */
function flatTexts(object: ts.ObjectLiteralExpression, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = `${prefix}${property.name.getText().replace(/^['"]|['"]$/g, '')}`;
    const value = unquote(property.initializer);
    if (value !== undefined) out[key] = value;
    else if (ts.isObjectLiteralExpression(property.initializer))
      Object.assign(out, flatTexts(property.initializer, `${key}.`));
  }
  return out;
}

function findCall<T>(file: ts.SourceFile, pick: (node: ts.Node) => T | undefined): T | undefined {
  let found: T | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    found = pick(node);
    if (found === undefined) ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export function parseProject(
  files: Files,
  profile: ProfilePack,
): { project: ParsedProject; report: ImportReport } {
  const { folders, fileSuffixes: suffix } = profile.conventions;
  const screenFile = new RegExp(
    `^${escapeRegExp(folders.screens ?? '')}/([^/]+)/\\1${escapeRegExp(suffix.screen ?? '')}$`,
  );
  const handled = new Set<string>();
  const kept = new Set<string>();

  let libraries: Record<string, string> = {};
  try {
    const pkg = JSON.parse(files['package.json'] ?? '{}') as Record<string, Record<string, string>>;
    libraries = { ...pkg.peerDependencies, ...pkg.dependencies };
  } catch {
    // An unreadable package.json only means no library versions.
  }

  const navText = Object.entries(files).find(
    ([path]) => path.startsWith(`${folders.navigation}/`) && path.endsWith('.navigator.tsx'),
  )?.[1];
  // Screens keep the navigator's order; any not listed there go last, alphabetically.
  const order = [...(navText ?? '').matchAll(/<Stack\.Screen\s+name=['"](\w+)['"]/g)].map(
    (m) => m[1],
  );
  const rank = (slug: string) => {
    const at = order.indexOf(toPascalCase(slug));
    return at < 0 ? order.length : at;
  };
  const slugs = Object.keys(files)
    .map((path) => screenFile.exec(path)?.[1])
    .filter((slug): slug is string => slug !== undefined)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const idOf = (slug: string) => `screen-${slug}`;
  const byPascal = new Map(slugs.map((slug) => [toPascalCase(slug), slug]));

  // Navigator: initial screen and route params.
  const navigatorPath = Object.keys(files).find(
    (path) => path.startsWith(`${folders.navigation}/`) && path.endsWith('.navigator.tsx'),
  );
  let initialScreenId: string | undefined;
  const routeParams = new Map<string, Connection['params']>();
  if (navigatorPath) {
    handled.add(navigatorPath);
    const nav = source(navigatorPath, files[navigatorPath] as string);
    const initial = findCall(nav, (node) =>
      ts.isJsxAttribute(node) &&
      node.name.getText() === 'initialRouteName' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
        ? node.initializer.text
        : undefined,
    );
    const slug = initial ? byPascal.get(initial) : undefined;
    if (slug) initialScreenId = idOf(slug);
    const params = findCall(nav, (node) =>
      ts.isTypeAliasDeclaration(node) &&
      node.name.text.endsWith('Params') &&
      ts.isTypeLiteralNode(node.type)
        ? node.type
        : undefined,
    );
    for (const member of params?.members ?? []) {
      if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type))
        continue;
      routeParams.set(
        member.name.getText(),
        member.type.members.filter(ts.isPropertySignature).map((entry) => ({
          name: entry.name.getText(),
          type: entry.type?.getText() ?? 'unknown',
          ...(entry.questionToken ? { optional: true } : {}),
        })),
      );
    }
  }
  // The public API, the root barrel and shared helpers carry no journey data.
  const rootIndex = `${(folders.public ?? 'src/public').replace(/\/[^/]*$/, '')}/index.tsx`;
  for (const path of Object.keys(files))
    if (
      path === rootIndex ||
      path.startsWith(`${folders.public}/`) ||
      path.endsWith('/create-yup.schema.ts') ||
      path === `${folders.values}/regex.ts`
    )
      handled.add(path);

  const used: Record<string, string> = {};
  const screens: Screen[] = [];
  const connections: Connection[] = [];
  const reportScreens: ImportReport['screens'] = [];

  for (const slug of slugs) {
    const dir = `${folders.screens}/${slug}`;
    const path = `${dir}/${slug}${suffix.screen}`;
    handled.add(path);
    const { nodes, rootId } = parseScreenNodes(
      idOf(slug),
      source(path, files[path] as string),
      libraries,
      used,
    );

    const uiStatePath = `${dir}/${slug}${suffix.uiState}`;
    const states: Screen['states'] = [];
    if (files[uiStatePath] !== undefined) {
      handled.add(uiStatePath);
      const names = findCall(source(uiStatePath, files[uiStatePath] as string), (node) =>
        ts.isTypeAliasDeclaration(node) &&
        node.name.text.endsWith('UiStatus') &&
        ts.isUnionTypeNode(node.type)
          ? node.type.types.flatMap((type) =>
              ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)
                ? [type.literal.text]
                : [],
            )
          : undefined,
      );
      for (const name of names ?? [])
        states.push({ id: `${idOf(slug)}.state.${name}`, name, sample: {} });
    }

    // Connections come from `goTo<Route>` handlers; the node bound to one triggers it.
    const vmPath = `${dir}/${slug}${suffix.viewModel}`;
    if (files[vmPath] !== undefined) {
      kept.add(vmPath);
      for (const [, route] of (files[vmPath] as string).matchAll(/\bgoTo(\w+)\s*:/g)) {
        const target = byPascal.get(route as string);
        if (!target) continue;
        const trigger = Object.values(nodes).find(
          (node) =>
            node.kind === 'component' &&
            Object.values(node.props).some(
              (value) =>
                value.type === 'binding' &&
                value.source === 'handler' &&
                value.path === `goTo${route}`,
            ),
        );
        connections.push({
          id: `conn-${slug}-${target}`,
          fromScreenId: idOf(slug),
          toScreenId: idOf(target),
          params: routeParams.get(route as string) ?? [],
          ...(trigger ? { triggerNodeId: trigger.id } : {}),
        });
      }
    }
    for (const extra of [`${dir}/${slug}${suffix.schema}`, `${dir}/model/${slug}${suffix.model}`])
      if (files[extra] !== undefined) kept.add(extra);

    const screen: Screen = {
      id: idOf(slug),
      name: toPascalCase(slug).replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
      rootId,
      nodes,
      states,
      logic: { hooks: [], blocks: [] },
    };
    screens.push(screen);
    const all = Object.values(nodes);
    const codeBlocks = all.filter((node) => node.kind === 'code').length;
    reportScreens.push({
      name: screen.name,
      components: all.length - codeBlocks,
      codeBlocks,
      coverage: all.length === 0 ? 1 : (all.length - codeBlocks) / all.length,
    });
  }

  // Values and domain models.
  let strings: Record<string, string> = {};
  const stringsPath = `${folders.values}/strings.ts`;
  if (files[stringsPath] !== undefined) {
    handled.add(stringsPath);
    const object = findCall(source(stringsPath, files[stringsPath] as string), (node) =>
      ts.isVariableDeclaration(node) && STRINGS_ROOTS.has(node.name.getText()) && node.initializer
        ? ts.isAsExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer
        : undefined,
    );
    if (object && ts.isObjectLiteralExpression(object)) strings = flatTexts(object);
  }
  const tokensPath = `${folders.values}/tokens.ts`;
  if (files[tokensPath] !== undefined) handled.add(tokensPath);

  const models: DomainModel[] = [];
  for (const path of Object.keys(files).sort()) {
    const modelSuffix = suffix.domainModel ?? suffix.model ?? '.model.ts';
    if (!path.startsWith(`${folders.domain}/model/`) || !path.endsWith(modelSuffix)) continue;
    handled.add(path);
    const file = source(path, files[path] as string);
    for (const statement of file.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      const name = statement.name.text.replace(/DomainModel$/, '');
      models.push({
        id: `model-${name}`,
        name,
        fields: statement.members.filter(ts.isPropertySignature).map((member) => ({
          name: member.name.getText(),
          type: member.type?.getText() ?? 'unknown',
          ...(member.questionToken ? { optional: true } : {}),
        })),
      });
    }
  }

  // Generated infrastructure that carries no journey data.
  for (const path of Object.keys(files)) {
    if (path.startsWith(`${folders.coreResult}/`) || path.startsWith(`${folders.coreError}/`))
      handled.add(path);
  }

  // Everything else is kept whole, including files a codec reads only in part (§17.3.10).
  const blocks: CodeBlock[] = [];
  const keptWhole: string[] = [];
  for (const path of Object.keys(files).sort()) {
    if (!/\.tsx?$/.test(path) || (handled.has(path) && !kept.has(path))) continue;
    keptWhole.push(path);
    const text = files[path] as string;
    blocks.push({
      language: path.endsWith('.tsx') ? 'tsx' : 'ts',
      source: text,
      imports: [],
      origin: { file: path, start: 0, end: text.length },
    });
  }

  return {
    project: {
      screens,
      connections,
      strings,
      models,
      blocks,
      libraries: used,
      ...(initialScreenId ? { initialScreenId } : {}),
    },
    report: { screens: reportScreens, keptWhole },
  };
}
