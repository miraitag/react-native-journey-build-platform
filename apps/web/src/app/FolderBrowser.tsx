import { useEffect, useState } from 'react';
import { ArrowUp, Folder } from 'lucide-react';
import { Button, IconButton, Spinner } from '@rnjb/ui';
import { localService, type BrowseResult } from '../services/local-service.ts';
import { useT } from './preferences.ts';
import { reportError } from './open-document.ts';

/** Directory picker backed by `/v1/fs/browse`; directory names only (§6.2). */
export function FolderBrowser({
  initialPath,
  onChoose,
  onCancel,
}: {
  initialPath: string | undefined;
  onChoose: (path: string) => void;
  onCancel: () => void;
}) {
  const i18n = useT();
  const [listing, setListing] = useState<BrowseResult>();
  const [loading, setLoading] = useState(true);

  const load = async (path?: string) => {
    setLoading(true);
    try {
      setListing(await localService.browse(path));
    } catch (error) {
      // An unreadable start path falls back to the browse root.
      if (path === initialPath && path) return load();
      reportError(error, i18n);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(initialPath);
    // Load once on mount; later navigation calls `load` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <IconButton
          label={i18n.t('browse.up')}
          icon={<ArrowUp size={14} />}
          disabled={!listing?.parent || loading}
          onClick={() => listing?.parent && void load(listing.parent)}
        />
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted"
          title={listing?.path}
        >
          {listing?.path ?? '…'}
        </p>
        {loading && <Spinner size={12} className="text-fg-subtle" />}
      </div>
      <ul className="h-56 overflow-auto rounded-md bg-input py-1 shadow-[inset_0_0_0_1px_var(--line-control)]">
        {listing && listing.directories.length === 0 && (
          <li className="px-3 py-2 text-xs text-fg-muted">{i18n.t('browse.empty')}</li>
        )}
        {listing?.directories.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => void load(`${listing.path}/${name}`)}
              className="flex h-7 w-full items-center gap-2 px-3 text-left text-sm hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <Folder size={14} aria-hidden className="shrink-0 text-fg-subtle" />
              <span className="truncate">{name}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {i18n.t('common.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!listing}
          onClick={() => listing && onChoose(listing.path)}
        >
          {i18n.t('browse.choose')}
        </Button>
      </div>
    </div>
  );
}
