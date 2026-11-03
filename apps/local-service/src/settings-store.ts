import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RnjbError, type SettingsPort } from '@rnjb/core';
import { defaultLocalSettings, validateLocalSettings, type LocalSettings } from '@rnjb/pack-schema';
import { writeFileAtomic } from './paths.ts';

/** `~/.rnjb/settings.json`: machine paths and sources; never versioned (§6.2). */
export class SettingsStore implements SettingsPort<LocalSettings> {
  readonly file: string;

  constructor(readonly home: string) {
    this.file = path.join(home, 'settings.json');
  }

  async load(): Promise<LocalSettings> {
    let text: string;
    try {
      text = await fs.readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultLocalSettings();
      throw error;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (cause) {
      throw new RnjbError('RNJB-405', { path: '(root)', detail: 'JSON' }, { cause });
    }
    const result = validateLocalSettings(raw);
    if (!result.ok) throw result.error;
    return result.value;
  }

  async save(settings: LocalSettings): Promise<LocalSettings> {
    const result = validateLocalSettings(settings);
    if (!result.ok) throw result.error;
    if (result.value.workspacePath) {
      const stat = await fs.stat(result.value.workspacePath).catch(() => undefined);
      if (!stat?.isDirectory())
        throw new RnjbError('RNJB-404', { path: result.value.workspacePath });
    }
    await fs.mkdir(this.home, { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.file, `${JSON.stringify(result.value, null, 2)}\n`, 0o600);
    return result.value;
  }
}
