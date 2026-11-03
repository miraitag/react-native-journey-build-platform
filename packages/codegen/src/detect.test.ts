import { defaultProfile } from '@rnjb/profiles';
import { describe, expect, it } from 'vitest';
import { PROFILE_THRESHOLD, scoreProfiles } from './detect.ts';

describe('scoreProfiles', () => {
  it('scores the share of src files that follow each profile layout', () => {
    const { screens, values } = defaultProfile.conventions.folders;
    const files = (paths: string[]) => Object.fromEntries(paths.map((path) => [path, '']));
    const following = files([`${screens}/a/a.screen.tsx`, `${values}/strings.ts`, 'package.json']);
    expect(scoreProfiles(following, [defaultProfile])[0]?.score).toBe(1);
    const mixed = files([`${screens}/a/a.screen.tsx`, 'src/utils/a.ts', 'src/lib/b.ts']);
    expect(scoreProfiles(mixed, [defaultProfile])[0]?.score).toBeLessThan(PROFILE_THRESHOLD);
    expect(scoreProfiles(files(['index.js']), [defaultProfile])[0]?.score).toBe(0);
  });
});
