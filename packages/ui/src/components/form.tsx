import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';
import { Switch as RadixSwitch, ToggleGroup } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cx } from '../cx.ts';

const control =
  'w-full rounded-md bg-input text-fg shadow-[inset_0_0_0_1px_var(--line-control)] ' +
  'transition-shadow duration-[var(--duration-fast)] hover:shadow-[inset_0_0_0_1px_var(--fg-subtle)] ' +
  'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--focus),0_0_0_3px_var(--accent-muted)] ' +
  'disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md';
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ size = 'md', mono, className, ...rest }: InputProps) {
  return (
    <input
      className={cx(
        control,
        size === 'sm'
          ? 'h-[var(--control-h-sm)] px-2 text-xs'
          : 'h-[var(--control-h-md)] px-2.5 text-sm',
        mono && 'font-mono text-xs',
        className,
      )}
      {...rest}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md';
  ref?: Ref<HTMLSelectElement>;
}

/** Native select: platform keyboard and screen-reader behaviour for free. */
export function Select({ size = 'sm', className, children, ...rest }: SelectProps) {
  return (
    <span className={cx('relative inline-flex', className)}>
      <select
        className={cx(
          control,
          'appearance-none pr-7',
          size === 'sm'
            ? 'h-[var(--control-h-sm)] pl-2 text-xs'
            : 'h-[var(--control-h-md)] pl-2.5 text-sm',
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-muted"
      />
    </span>
  );
}

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className={cx(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-[var(--duration-fast)]',
        'bg-line-control data-[state=checked]:bg-accent',
      )}
    >
      <RadixSwitch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-on-accent transition-transform duration-[var(--duration-fast)] data-[state=checked]:translate-x-[14px]" />
    </RadixSwitch.Root>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  iconOnly,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  iconOnly?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next as T)}
      aria-label={label}
      className="inline-flex h-[var(--control-h-sm)] items-center gap-0.5 rounded-md bg-hover p-0.5"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          aria-label={iconOnly ? option.label : undefined}
          title={iconOnly ? option.label : undefined}
          className={cx(
            'inline-flex h-full items-center gap-1.5 rounded-sm px-2 text-xs text-fg-muted transition-colors',
            'hover:text-fg data-[state=on]:bg-panel data-[state=on]:text-fg data-[state=on]:shadow-[0_0_0_1px_var(--line-subtle)]',
          )}
        >
          {option.icon}
          {!iconOnly && option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
