import { useEffect, useRef } from 'react';
import { monaco } from './monaco-setup.ts';

/**
 * Side-by-side review of an exported file: the left side is what is on disk, the right side is
 * the result that will be written and can be edited. Loaded lazily with the rest of Monaco.
 */
export default function DiffEditor({
  original,
  value,
  path,
  label,
  onChange,
}: {
  original: string;
  value: string;
  path: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const modified = useRef<monaco.editor.ITextModel | null>(null);
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const language = /\.tsx?$/.test(path) ? 'typescript' : 'plaintext';
    const left = monaco.editor.createModel(original, language);
    const right = monaco.editor.createModel(value, language);
    modified.current = right;
    const instance = monaco.editor.createDiffEditor(host.current, {
      theme: 'vs-dark',
      ariaLabel: label,
      automaticLayout: true,
      originalEditable: false,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      scrollbar: { alwaysConsumeMouseWheel: false },
    });
    instance.setModel({ original: left, modified: right });
    const subscription = right.onDidChangeContent(() => latest.current(right.getValue()));
    return () => {
      subscription.dispose();
      instance.dispose();
      left.dispose();
      right.dispose();
      modified.current = null;
    };
    // One editor per file: the component is keyed by path, and `value` is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Buttons such as "use ours" replace the text from outside the editor.
  useEffect(() => {
    const model = modified.current;
    if (model && model.getValue() !== value) model.setValue(value);
  }, [value]);

  return (
    <div
      ref={host}
      className="h-72 w-full overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--line-subtle)]"
    />
  );
}
