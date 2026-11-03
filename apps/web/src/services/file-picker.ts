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
