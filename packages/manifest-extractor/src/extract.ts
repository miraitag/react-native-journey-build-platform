import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError } from '@rnjb/core';
import type { ComponentManifest, PropManifest } from '@rnjb/pack-schema';
import { analyse, ts, type Analysis } from '@rnjb/ts-analysis';

/**
 * Extracts a library manifest from its public entry point (§7.1 step 2): exported components,
 * their props (type, optionality, default), variants and a suggested category.
 * Props inherited from other packages (for example `ViewProps`) are not listed: the manifest
 * describes what the library itself declares.
 */

export interface ExtractedLibrary {
  package: string;
  packageVersion: string;
  /** Entry point relative to the library root, with `/` separators. */
  entry: string;
  components: ComponentManifest[];
}

export interface ExtractOptions {
  /** When set, the `name` in `package.json` must match (RNJB-102). */
  expectedPackage?: string;
}

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;
const GENERIC_FOLDERS = new Set([
  'src',
  'lib',
  'dist',
  'build',
  'components',
  'typescript',
  'module',
]);
const NODE_TYPE = /\b(ReactNode|ReactElement|ReactChild|JSX\.Element|Element)\b/;
const SKIPPED_PROPS = new Set(['key', 'ref']);

const isInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

interface PackageJson {
  name?: unknown;
  version?: unknown;
  source?: unknown;
  types?: unknown;
  typings?: unknown;
}

async function readPackage(
  root: string,
): Promise<{ name: string; version: string; json: PackageJson }> {
  let json: PackageJson;
  try {
    json = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as PackageJson;
  } catch (cause) {
    throw new RnjbError('RNJB-101', { path: root }, { cause });
  }
  if (typeof json.name !== 'string' || typeof json.version !== 'string') {
    throw new RnjbError('RNJB-502', { file: path.join(root, 'package.json') });
  }
  return { name: json.name, version: json.version, json };
}

/** `source` first (real types, with defaults), then `types`; both must stay inside the library. */
async function findEntry(root: string, json: PackageJson): Promise<string> {
  const candidates = [json.source, json.types, json.typings].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  for (const candidate of candidates) {
    const absolute = path.resolve(root, candidate);
    if (!isInside(root, absolute)) throw new RnjbError('RNJB-403', { path: candidate });
    const exists = await fs.stat(absolute).then(
      (stat) => stat.isFile(),
      () => false,
    );
    if (exists) return absolute;
  }
  throw new RnjbError('RNJB-104', { package: String(json.name) });
}

export async function extractManifest(
  rootPath: string,
  options: ExtractOptions = {},
): Promise<ExtractedLibrary> {
  const root = await fs.realpath(rootPath).catch((cause: unknown) => {
    throw new RnjbError('RNJB-101', { path: rootPath }, { cause });
  });
  const pkg = await readPackage(root);
  if (options.expectedPackage && pkg.name !== options.expectedPackage) {
    throw new RnjbError('RNJB-102', { expected: options.expectedPackage, found: pkg.name });
  }
  const entryFile = await findEntry(root, pkg.json);
  const analysis = analyse(entryFile);
  const components = extractComponents(analysis, root);
  return {
    package: pkg.name,
    packageVersion: pkg.version,
    entry: path.relative(root, entryFile).split(path.sep).join('/'),
    components,
  };
}

// ---------------------------------------------------------------------------

function extractComponents(
  { program, checker, entry }: Analysis,
  root: string,
): ComponentManifest[] {
  const moduleSymbol = checker.getSymbolAtLocation(entry);
  if (!moduleSymbol) return [];
  const seen = new Set<ts.Symbol>();
  const components: ComponentManifest[] = [];

  const isExternal = (declaration: ts.Declaration): boolean => {
    const file = declaration.getSourceFile();
    return program.isSourceFileDefaultLibrary(file) || file.fileName.includes('/node_modules/');
  };

  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const name = exported.name;
    if (seen.has(symbol) || !COMPONENT_NAME.test(name) || !(symbol.flags & ts.SymbolFlags.Value)) {
      continue;
    }
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) continue;
    const props = componentProps(checker, symbol, declaration);
    if (!props) continue;
    seen.add(symbol);

    const defaults = defaultsOf(declaration);
    const manifestProps: PropManifest[] = (
      props === 'none' ? [] : checker.getPropertiesOfType(props)
    )
      .filter((prop) => !SKIPPED_PROPS.has(prop.name))
      .filter((prop) => {
        const declared = prop.declarations?.[0];
        return declared !== undefined && !isExternal(declared);
      })
      .map((prop) => propManifest(checker, prop, defaults))
      .sort((a, b) => a.name.localeCompare(b.name));

    const category = categoryOf(declaration, root);
    const variantProps = manifestProps
      .filter((prop) => prop.kind === 'enum')
      .map((prop) => prop.name);
    components.push({
      name,
      ...(category ? { category } : {}),
      origin: 'extracted',
      props: manifestProps,
      ...(variantProps.length > 0 ? { variantProps } : {}),
      nesting: { acceptsChildren: manifestProps.some((prop) => prop.name === 'children') },
    });
  }
  return components.sort((a, b) => a.name.localeCompare(b.name));
}

/** The props type of a function, class or wrapped (memo / forwardRef) component. */
function componentProps(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  declaration: ts.Declaration,
): ts.Type | 'none' | undefined {
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const [signature] = type.getCallSignatures();
  if (signature) {
    // Plain functions in `.ts` files are utilities, not components.
    const file = declaration.getSourceFile().fileName;
    const returns = checker.typeToString(signature.getReturnType());
    if (!/\.(tsx|d\.ts)$/.test(file) && !NODE_TYPE.test(returns)) return undefined;
    const parameter = signature.parameters[0];
    if (!parameter) return 'none';
    return checker.getTypeOfSymbolAtLocation(parameter, declaration);
  }
  const [construct] = type.getConstructSignatures();
  if (construct) {
    const instance = construct.getReturnType();
    const propsSymbol = instance.getProperty('props');
    return propsSymbol ? checker.getTypeOfSymbolAtLocation(propsSymbol, declaration) : undefined;
  }
  return undefined;
}

function propManifest(
  checker: ts.TypeChecker,
  prop: ts.Symbol,
  defaults: ReadonlyMap<string, string | number | boolean | null>,
): PropManifest {
  const declaration = prop.declarations?.[0] as ts.Declaration;
  const optional = Boolean(prop.flags & ts.SymbolFlags.Optional);
  const type = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(prop, declaration));
  const written =
    (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) &&
    declaration.type
      ? declaration.type.getText()
      : checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation);
  const { kind, options } = classify(type, written);
  const fallback = defaults.get(prop.name);
  return {
    name: prop.name,
    type: written,
    kind,
    ...(options ? { options } : {}),
    optional,
    ...(fallback !== undefined ? { default: fallback } : {}),
    origin: 'extracted',
  };
}

function classify(
  type: ts.Type,
  written: string,
): { kind: PropManifest['kind']; options?: (string | number)[] } {
  if (NODE_TYPE.test(written)) return { kind: 'node' };
  if (type.flags & ts.TypeFlags.BooleanLike) return { kind: 'boolean' };
  if (type.isUnion()) {
    const members = type.types;
    if (members.every((member) => member.flags & ts.TypeFlags.BooleanLike))
      return { kind: 'boolean' };
    if (members.every((member) => member.isStringLiteral() || member.isNumberLiteral())) {
      return {
        kind: 'enum',
        options: members.map((member) => (member as ts.LiteralType).value as string | number),
      };
    }
  }
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return { kind: 'enum', options: [type.value as string | number] };
  }
  if (type.flags & ts.TypeFlags.StringLike) return { kind: 'string' };
  if (type.flags & ts.TypeFlags.NumberLike) return { kind: 'number' };
  if (type.getCallSignatures().length > 0) return { kind: 'function' };
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return { kind: 'unknown' };
  if (type.flags & ts.TypeFlags.Object || type.isIntersection()) return { kind: 'object' };
  return { kind: 'unknown' };
}

type Literal = string | number | boolean | null;

/** Defaults written as `({ variant = 'primary' }) => …` in the component's own parameters. */
function defaultsOf(declaration: ts.Declaration): Map<string, Literal> {
  const defaults = new Map<string, Literal>();
  const fn = functionOf(declaration);
  const pattern = fn?.parameters[0]?.name;
  if (!pattern || !ts.isObjectBindingPattern(pattern)) return defaults;
  for (const element of pattern.elements) {
    const key = element.propertyName ?? element.name;
    if (!ts.isIdentifier(key) || !element.initializer) continue;
    const value = literalOf(element.initializer);
    if (value !== undefined) defaults.set(key.text, value);
  }
  return defaults;
}

function functionOf(declaration: ts.Declaration): ts.SignatureDeclaration | undefined {
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return undefined;
  let expression: ts.Expression = declaration.initializer;
  // memo(fn), forwardRef(fn) and nested wrappers.
  while (ts.isCallExpression(expression) && expression.arguments[0]) {
    expression = expression.arguments[0];
  }
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)
    ? expression
    : undefined;
}

function literalOf(node: ts.Expression): Literal | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  return undefined;
}

/** Suggested category: the folder that holds the component, unless it is a generic one. */
function categoryOf(declaration: ts.Declaration, root: string): string | undefined {
  const file = declaration.getSourceFile().fileName;
  if (!isInside(root, file)) return undefined;
  const folders = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean);
  const folder = [...folders]
    .reverse()
    .find((segment) => !GENERIC_FOLDERS.has(segment.toLowerCase()));
  if (!folder) return undefined;
  return folder
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
