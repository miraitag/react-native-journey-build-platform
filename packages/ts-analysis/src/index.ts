import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

/**
 * One TypeScript program shared by the extractor and the importer. Parsed files are cached by
 * the hash of their text, so analysing the same library again only re-parses what changed.
 */

export interface Analysis {
  program: ts.Program;
  checker: ts.TypeChecker;
  entry: ts.SourceFile;
}

const CACHE_LIMIT = 4000;
const parsed = new Map<string, { hash: string; file: ts.SourceFile }>();

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
  allowJs: false,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  // Never load ambient @types from the host: results must depend on the library only.
  types: [],
};

const require = createRequire(import.meta.url);

/**
 * Libraries such as `react-native` declare `@types/react` as an optional peer, so a source
 * downloaded alone does not have it and every class component loses its props. When the library
 * cannot resolve these, the platform's own React types are used; a library that ships or installs
 * its own still gets those.
 */
const reactTypes = path.dirname(require.resolve('@types/react/package.json'));
const FALLBACK_TYPES: Readonly<Record<string, string>> = {
  react: path.join(reactTypes, 'index.d.ts'),
  'react/jsx-runtime': path.join(reactTypes, 'jsx-runtime.d.ts'),
};

/** Builds a program for `entryFile`; resolution of imports starts at the library's own folder. */
export function analyse(entryFile: string, options: ts.CompilerOptions = {}): Analysis {
  const compilerOptions = { ...COMPILER_OPTIONS, ...options };
  const host = ts.createCompilerHost(compilerOptions, true);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreate) => {
    const text = host.readFile(fileName);
    if (text === undefined)
      return original(fileName, languageVersionOrOptions, onError, shouldCreate);
    const hash = sha1(text);
    const key = `${fileName}\0${String(ts.ScriptTarget.ES2022)}`;
    const hit = parsed.get(key);
    if (hit?.hash === hash) return hit.file;
    const file = ts.createSourceFile(fileName, text, languageVersionOrOptions, true);
    if (parsed.size >= CACHE_LIMIT) parsed.clear();
    parsed.set(key, { hash, file });
    return file;
  };
  host.resolveModuleNameLiterals = (literals, containingFile, _redirected, resolveOptions) =>
    literals.map((literal) => {
      const result = ts.resolveModuleName(literal.text, containingFile, resolveOptions, host);
      const fallback = result.resolvedModule ? undefined : FALLBACK_TYPES[literal.text];
      return fallback
        ? {
            resolvedModule: {
              resolvedFileName: fallback,
              extension: ts.Extension.Dts,
              isExternalLibraryImport: true,
            },
          }
        : result;
    });
  const program = ts.createProgram({ rootNames: [entryFile], options: compilerOptions, host });
  const entry = program.getSourceFile(entryFile);
  if (!entry) throw new Error(`Entry point not found: ${entryFile}`);
  return { program, checker: program.getTypeChecker(), entry };
}

export { ts };
