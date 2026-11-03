import type { DocumentKind, ProfileRef, Provenance } from './entities.ts';

/** Ports (ADR 0009): adapters live in the web app, the local service or Electron. */

export interface IdPort {
  next(): string;
}

export interface ClockPort {
  /** ISO-8601 timestamp. */
  now(): string;
}

export interface HashPort {
  /** Lowercase hex SHA-256 of the UTF-8 bytes of `text`. */
  sha256(text: string): Promise<string>;
}

export type EntryOrigin = 'local' | 'imported' | 'remote';

export interface WorkspaceEntry {
  /** Relative to the workspace root, always with `/`. */
  path: string;
  kind: DocumentKind;
  slug: string;
  name: string;
  updatedAt: string;
  profile: ProfileRef;
  libraries: string[];
  origin: EntryOrigin;
  /** Where an entry came from (copies) or lives (items of a remote source); see §6.4. */
  remote?: NonNullable<Provenance['remote']>;
  screenCount: number;
  /** Board map for the Home thumbnail: screen positions (capped) and links by index. */
  outline: JourneyOutline;
}

export interface JourneyOutline {
  screens: { x: number; y: number; initial: boolean }[];
  links: [number, number][];
}

export const OUTLINE_MAX_SCREENS = 60;

/** Builds the Home thumbnail map from a document's board and connections. */
export function buildOutline(document: {
  screens: readonly { id: string }[];
  connections: readonly { fromScreenId: string; toScreenId: string }[];
  board: { positions: Record<string, { x: number; y: number }>; initialScreenId?: string };
}): JourneyOutline {
  const screens = document.screens.slice(0, OUTLINE_MAX_SCREENS);
  const index = new Map(screens.map((screen, i) => [screen.id, i]));
  return {
    screens: screens.map((screen) => ({
      ...(document.board.positions[screen.id] ?? { x: 0, y: 0 }),
      initial: document.board.initialScreenId === screen.id,
    })),
    links: document.connections.flatMap((connection) => {
      const from = index.get(connection.fromScreenId);
      const to = index.get(connection.toScreenId);
      return from === undefined || to === undefined || from === to
        ? []
        : [[from, to] as [number, number]];
    }),
  };
}

export interface WorkspacePort {
  index(): Promise<WorkspaceEntry[]>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
}

export interface SettingsPort<TSettings> {
  load(): Promise<TSettings>;
  save(settings: TSettings): Promise<TSettings>;
}
