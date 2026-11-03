import { slugPrefixesFromTemplates } from '@rnjb/core';
import { profilePackSchema, type ProfilePack } from '@rnjb/pack-schema';
import featureLibrary from './feature-library.profile.json' with { type: 'json' };

/** Default profile, validated at load so a bad edit fails loudly (§7.5). */
export const defaultProfile: ProfilePack = profilePackSchema.parse(featureLibrary);

export const BUILT_IN_PROFILES: readonly ProfilePack[] = [defaultProfile];

export const profilePrefixes = (profile: ProfilePack): string[] =>
  slugPrefixesFromTemplates(Object.values(profile.conventions.nameTemplates));

export const canExport = (profile: ProfilePack): boolean => profile.codecs.length > 0;
export { builtInDevicesPack } from './devices.builtin.ts';
