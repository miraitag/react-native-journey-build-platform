import type { ReactNode } from 'react';
import { Dialog as RadixDialog, DropdownMenu, Tabs as RadixTabs } from 'radix-ui';
import { X } from 'lucide-react';
import { cx } from '../cx.ts';

// --- Dialog -----------------------------------------------------------------

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  width = 480,
  closeLabel,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeLabel: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[oklch(0.18_0.01_256/0.42)] data-[state=open]:animate-[fade-in_160ms_var(--ease-out)]" />
      <RadixDialog.Content
        style={{ width }}
        className={cx(
          'fixed top-[12vh] left-1/2 z-50 max-h-[76vh] max-w-[calc(100vw-32px)] -translate-x-1/2',
          'flex flex-col overflow-hidden rounded-lg bg-raised text-fg shadow-popover',
          'data-[state=open]:animate-[dialog-in_180ms_var(--ease-out)]',
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-sm text-fg-muted">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label={closeLabel}
            className="-mt-0.5 -mr-1.5 inline-flex size-[var(--control-h-sm)] items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X size={16} />
          </RadixDialog.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-subtle bg-panel px-5 py-3">
            {footer}
          </footer>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

// --- Tabs -------------------------------------------------------------------

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <RadixTabs.List
      aria-label={label}
      className={cx('flex items-stretch gap-0.5 overflow-x-auto', className)}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cx(
        'relative inline-flex h-8 shrink-0 items-center gap-1.5 px-2 text-xs font-medium text-fg-muted',
        'hover:text-fg data-[state=active]:text-fg',
        'after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-transparent',
        'data-[state=active]:after:bg-accent',
        className,
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

// --- Menu -------------------------------------------------------------------

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = 'start',
}: {
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={4}
        className="z-50 min-w-[200px] rounded-lg bg-raised p-1 text-sm text-fg shadow-popover"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  icon,
  shortcut,
  onSelect,
  disabled,
  tone,
}: {
  children: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cx(
        'flex h-7 items-center gap-2 rounded-md px-2 outline-none select-none',
        'data-[highlighted]:bg-hover data-[disabled]:opacity-45',
        tone === 'danger' && 'text-danger-fg',
      )}
    >
      <span className="flex size-4 items-center justify-center text-fg-muted">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-fg-subtle">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line-subtle" />;
