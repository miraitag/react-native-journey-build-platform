import { useState } from 'react';
import { Input } from '@rnjb/ui';

/** Text field that commits on blur or Enter, so typing makes one history entry, not one per key. */
export function CommitInput({
  value,
  label,
  onCommit,
  disabled,
  mono,
  placeholder,
  className,
  list,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  mono?: boolean;
  placeholder?: string;
  className?: string;
  /** Id of a `<datalist>` with suggestions. */
  list?: string;
}) {
  const [draft, setDraft] = useState<string>();
  const commit = () => {
    if (draft !== undefined && draft !== value) onCommit(draft);
    setDraft(undefined);
  };
  return (
    <Input
      size="sm"
      mono={mono}
      list={list}
      aria-label={label}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(undefined);
      }}
    />
  );
}
