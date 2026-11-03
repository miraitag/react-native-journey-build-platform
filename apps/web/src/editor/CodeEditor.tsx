import { useEffect, useRef } from 'react';
import { monaco } from './monaco-setup.ts';

/**
 * Monaco editor for the code of an effect (§14.2). It is its own module and loaded lazily so the
 * editor costs nothing until a body is opened. The code is stored with the journey, never executed.
 */
export default function CodeEditor({
  value,
  label,
  onChange,
  readOnly,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const instance = monaco.editor.create(host.current, {
      value,
      language: 'typescript',
      theme: 'vs-dark',
      ariaLabel: label,
      readOnly: readOnly ?? false,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12,
      lineNumbers: 'off',
      tabSize: 2,
      scrollbar: { alwaysConsumeMouseWheel: false },
    });
    editor.current = instance;
    const subscription = instance.onDidChangeModelContent(() => {
      latest.current(instance.getValue());
    });
    return () => {
      subscription.dispose();
      instance.dispose();
      editor.current = null;
    };
    // The editor is created once; value, label and readOnly are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the user types, the editor is the source of truth: a value that lags one render behind
  // would otherwise overwrite the last keystrokes.
  useEffect(() => {
    const instance = editor.current;
    if (!instance || instance.hasTextFocus()) return;
    if (instance.getValue() !== value) instance.setValue(value);
  }, [value]);

  useEffect(() => {
    editor.current?.updateOptions({ readOnly: readOnly ?? false, ariaLabel: label });
  }, [readOnly, label]);

  return (
    <div
      ref={host}
      className="h-48 w-full overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--line-subtle)]"
    />
  );
}
