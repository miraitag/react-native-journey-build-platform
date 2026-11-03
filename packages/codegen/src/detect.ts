import type { ProfilePack } from '@rnjb/pack-schema';
import type { Files } from './plan.ts';

/** Share of a profile's structure a repository must have to use it (§17.2); calibrate with real repos. */
export const PROFILE_THRESHOLD = 0.7;

export interface ProfileMatch {
  id: string;
  version: string;
  /** 0..1: share of the files under `src/` that sit in one of the profile's folders. */
  score: number;
}

/** How well a repository follows each profile's folder layout, best first. */
export function scoreProfiles(files: Files, profiles: readonly ProfilePack[]): ProfileMatch[] {
  const sources = Object.keys(files).filter((path) => path.startsWith('src/'));
  return profiles
    .map((profile) => {
      const folders = Object.values(profile.conventions.folders);
      const inside = sources.filter((path) =>
        folders.some((folder) => path.startsWith(`${folder}/`)),
      );
      const score = sources.length ? inside.length / sources.length : 0;
      return { id: profile.id, version: profile.version, score };
    })
    .sort((a, b) => b.score - a.score);
}
