import * as monaco from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/languages/definitions/typescript/register.js';
// The icon font of the diff gutter and the widgets; editor.api alone does not load it.
import 'monaco-editor/features/codicon/register.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

// Only the base editor worker is bundled: effect bodies are stored, never run or type-checked.
const environment = self as typeof self & {
  MonacoEnvironment?: { getWorker: () => Worker };
};
environment.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export { monaco };
