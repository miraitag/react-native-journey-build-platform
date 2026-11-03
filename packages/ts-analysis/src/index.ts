import { createHash } from 'node:crypto';
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
  const program = ts.createProgram({ rootNames: [entryFile], options: compilerOptions, host });
  const entry = program.getSourceFile(entryFile);
  if (!entry) throw new Error(`Entry point not found: ${entryFile}`);
  return { program, checker: program.getTypeChecker(), entry };
}

export { ts };
