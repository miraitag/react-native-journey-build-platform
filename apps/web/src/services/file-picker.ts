/** Standalone `.rnjb` files (§18.5): File System Access API with an `<input type=file>` fallback. */

export interface PickedFile {
  name: string;
  text: string;
  handle?: FileSystemFileHandle;
}

interface OpenFilePickerWindow {
  showOpenFilePicker?: (options: {
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

export async function pickRnjbFile(): Promise<PickedFile | undefined> {
  const picker = (window as unknown as OpenFilePickerWindow).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        types: [{ description: 'RN Journey Builder', accept: { 'application/json': ['.rnjb'] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      if (!handle) return undefined;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return undefined;
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.rnjb,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text() } : undefined);
    });
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

export interface PickedFolder {
  name: string;
  /** `.rnjb` files found, by path relative to the folder. */
  files: { path: string; handle: FileSystemFileHandle }[];
}

type DirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterable<FileSystemFileHandle | DirectoryHandle>;
};

export const canPickFolder = (): boolean => 'showDirectoryPicker' in window;

/**
 * Without the local service, Chromium can still read a workspace folder (§6.7). Walks three levels,
 * enough for `journeys/<slug>/<slug>.rnjb`; hidden folders (`.rnjb-cache`, `.git`) are skipped.
 */
export async function pickRnjbFolder(): Promise<PickedFolder | undefined> {
  const picker = (window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;
  let root: DirectoryHandle;
  try {
    root = await picker();
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') return undefined;
    throw error;
  }
  const files: PickedFolder['files'] = [];
  const walk = async (directory: DirectoryHandle, prefix: string, depth: number) => {
    for await (const entry of directory.values()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.kind === 'file') {
        if (entry.name.endsWith('.rnjb')) files.push({ path: prefix + entry.name, handle: entry });
      } else if (depth < 3) {
        await walk(entry, `${prefix}${entry.name}/`, depth + 1);
      }
    }
  };
  await walk(root, '', 1);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name: root.name, files };
}
