import type { ReactNode } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { cx } from '../cx.ts';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cx('animate-spin motion-reduce:animate-none', className)}
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx('animate-pulse rounded-sm bg-hover motion-reduce:animate-none', className)}
    />
  );
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-hover text-fg-muted',
  accent: 'bg-accent-subtle text-accent-fg',
  success: 'bg-success-subtle text-success-fg',
  warning: 'bg-warning-subtle text-warning-fg',
  danger: 'bg-danger-subtle text-danger-fg',
  info: 'bg-info-subtle text-info-fg',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-start gap-2 px-4 py-6 text-sm', className)}>
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="max-w-[44ch] text-fg-muted">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Sonner configured per §10.4: max 3 visible, errors persist, close button, aria-live. */
export function Toaster({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      visibleToasts={3}
      closeButton
      offset={36}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            '!bg-raised !text-fg !border-line !shadow-popover !rounded-lg !font-sans !text-sm !gap-2 !items-start',
          description: '!text-fg-muted',
          actionButton: '!bg-accent !text-on-accent !rounded-md !text-xs !font-medium',
          closeButton: '!bg-raised !border-line !text-fg-muted hover:!text-fg',
          success: '[&_[data-icon]]:!text-success',
          info: '[&_[data-icon]]:!text-info',
          warning: '[&_[data-icon]]:!text-warning-fg',
          error: '!border-danger-line [&_[data-icon]]:!text-danger',
        },
      }}
    />
  );
}
