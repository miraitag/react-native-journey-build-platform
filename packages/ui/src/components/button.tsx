import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Tooltip } from 'radix-ui';
import { cx } from '../cx.ts';
import { Spinner } from './feedback.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none ' +
  'transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover',
  secondary:
    'bg-panel text-fg shadow-[inset_0_0_0_1px_var(--line-control)] hover:bg-hover active:bg-active',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-active',
  danger: 'bg-danger text-on-accent hover:brightness-95 active:brightness-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-[var(--control-h-sm)] px-2.5 text-xs',
  md: 'h-[var(--control-h-md)] px-3 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; also shown as tooltip. */
  label: string;
  icon: ReactNode;
  size?: ButtonSize;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  size = 'sm',
  shortcut,
  active,
  className,
  tooltipSide = 'bottom',
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type={type}
          aria-label={label}
          aria-pressed={active}
          className={cx(
            'inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted',
            'transition-colors duration-[var(--duration-fast)] hover:bg-hover hover:text-fg active:bg-active',
            'disabled:pointer-events-none disabled:opacity-45',
            active && 'bg-accent-subtle text-accent-fg hover:bg-accent-subtle hover:text-accent-fg',
            size === 'sm' ? 'size-[var(--control-h-sm)]' : 'size-[var(--control-h-md)]',
            className,
          )}
          {...rest}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <TooltipBody side={tooltipSide}>
        {label}
        {shortcut && <Kbd className="ml-2">{shortcut}</Kbd>}
      </TooltipBody>
    </Tooltip.Root>
  );
}

export function TooltipBody({
  children,
  side = 'bottom',
}: {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        side={side}
        sideOffset={6}
        className="z-50 flex items-center rounded-md bg-fg px-2 py-1 text-xs text-panel shadow-popover"
      >
        {children}
      </Tooltip.Content>
    </Tooltip.Portal>
  );
}

export function WithTooltip({
  label,
  children,
  side,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <TooltipBody side={side}>{label}</TooltipBody>
    </Tooltip.Root>
  );
}

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <Tooltip.Provider delayDuration={500} skipDelayDuration={200}>
    {children}
  </Tooltip.Provider>
);

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm px-1 font-sans text-2xs font-medium',
        'bg-[color-mix(in_oklch,currentColor_14%,transparent)] text-current',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
