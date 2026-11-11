import { CircleAlert, FolderOpen, GitBranch, Library } from 'lucide-react';
import { Spinner, WithTooltip, cx } from '@rnjb/ui';
import { useService } from '../services/service-store.ts';
import { useT } from './preferences.ts';
import { useDialogs } from './dialogs-store.ts';

/** Bottom status bar (§10.2): service, workspace, library sources, remotes. */
export function StatusBar({ unresolvedLibraries }: { unresolvedLibraries: number }) {
  const i18n = useT();
  const status = useService((state) => state.status);
  const settings = useService((state) => state.settings);
  const show = useDialogs((state) => state.show);
  const remotes = settings?.remoteSources.length ?? 0;
  const serviceLabel = i18n.t(
    status === 'online'
      ? 'status.serviceOnline'
      : status === 'offline'
        ? 'status.serviceOffline'
        : 'status.serviceChecking',
  );

  const item = 'flex h-full items-center gap-1.5 px-2 hover:bg-hover hover:text-fg';

  return (
    <footer
      role="status"
      data-tour="statusbar"
      className="flex h-6 shrink-0 items-stretch border-t border-line-subtle bg-chrome text-2xs text-fg-muted select-none"
    >
      <WithTooltip
        label={status === 'offline' ? i18n.t('status.reduced') : serviceLabel}
        side="top"
      >
        <button type="button" onClick={() => show('settings')} className={item}>
          {status === 'checking' ? (
            <Spinner size={10} />
          ) : (
            <span
              aria-hidden
              className={cx(
                'size-1.5 rounded-full',
                status === 'online' ? 'bg-success' : 'bg-warning',
              )}
            />
          )}
          {serviceLabel}
        </button>
      </WithTooltip>
      {status === 'online' && (
        <button type="button" onClick={() => show('settings')} className={cx(item, 'min-w-0')}>
          <FolderOpen size={12} aria-hidden className="shrink-0" />
          <span className="truncate font-mono">
            {settings?.workspacePath
              ? i18n.t('status.workspace', { path: settings.workspacePath })
              : i18n.t('status.noWorkspace')}
          </span>
        </button>
      )}
      <div className="flex-1" />
      <span
        className={cx(
          item,
          'hover:bg-transparent',
          unresolvedLibraries > 0 && 'text-warning-fg hover:text-warning-fg',
        )}
      >
        {unresolvedLibraries > 0 ? (
          <CircleAlert size={12} aria-hidden />
        ) : (
          <Library size={12} aria-hidden />
        )}
        {unresolvedLibraries > 0
          ? i18n.t('status.libraries', { count: unresolvedLibraries })
          : i18n.t('status.librariesOk')}
      </span>
      {remotes > 0 && (
        <span className={cx(item, 'hover:bg-transparent')}>
          <GitBranch size={12} aria-hidden />
          {i18n.t('status.remotes', { count: remotes })}
        </span>
      )}
    </footer>
  );
}
