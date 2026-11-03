import { describe, expect, it } from 'vitest';
import { parseRemoteUrl } from './parse-url.ts';

const ok = (url: string) => {
  const result = parseRemoteUrl(url);
  if (!result.ok) throw result.error;
  return result.value;
};
const code = (url: string) => {
  const result = parseRemoteUrl(url);
  return result.ok ? 'ok' : result.error.code;
};

describe('parseRemoteUrl', () => {
  it('splits a Bitbucket Cloud browser URL', () => {
    expect(ok('https://bitbucket.org/acme/journeys/src/main/mobile/loans')).toEqual({
      provider: 'bitbucket-cloud',
      remote: 'https://bitbucket.org/acme/journeys.git',
      ref: 'main',
      path: 'mobile/loans',
    });
  });

  it('accepts a Cloud repository URL without ref or folder', () => {
    expect(ok('https://bitbucket.org/acme/journeys')).toEqual({
      provider: 'bitbucket-cloud',
      remote: 'https://bitbucket.org/acme/journeys.git',
      path: '',
    });
  });

  it('splits a Data Center browser URL with the ref in `at`', () => {
    expect(
      ok(
        'https://git.acme.com/projects/MOB/repos/journeys/browse/templates?at=refs%2Fheads%2Frelease',
      ),
    ).toEqual({
      provider: 'bitbucket-data-center',
      remote: 'https://git.acme.com/scm/mob/journeys.git',
      ref: 'release',
      path: 'templates',
    });
  });

  it('keeps the context path and handles tags and personal repositories', () => {
    expect(ok('https://acme.com/stash/projects/MOB/repos/j/browse?at=refs/tags/v1')).toEqual({
      provider: 'bitbucket-data-center',
      remote: 'https://acme.com/stash/scm/mob/j.git',
      ref: 'v1',
      path: '',
    });
    expect(ok('https://acme.com/users/Ana/repos/j/browse').remote).toBe(
      'https://acme.com/scm/~ana/j.git',
    );
  });

  it('takes a plain git URL or an ssh URL as is, without a ref', () => {
    expect(ok('https://example.com/team/repo.git')).toEqual({
      provider: 'git',
      remote: 'https://example.com/team/repo.git',
      path: '',
    });
    expect(ok('ssh://git@example.com/team/repo.git')).toMatchObject({
      provider: 'git',
      remote: 'ssh://git@example.com/team/repo.git',
    });
  });

  it('refuses URLs that carry a password or token, without echoing it (RNJB-109)', () => {
    for (const url of [
      'https://x-token-auth:SECRET@bitbucket.org/acme/j/src/main/',
      'https://SECRET@example.com/team/repo.git',
      'ssh://git:SECRET@example.com/team/repo.git',
    ]) {
      const result = parseRemoteUrl(url);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RNJB-109');
        expect(JSON.stringify(result.error.params)).not.toContain('SECRET');
      }
    }
  });

  it('rejects schemes that are not https or ssh (RNJB-105)', () => {
    expect(code('file:///etc/passwd')).toBe('RNJB-105');
    expect(code('http://bitbucket.org/acme/j')).toBe('RNJB-105');
  });

  it('rejects what it cannot interpret or that escapes the repository (RNJB-107)', () => {
    expect(code('not a url')).toBe('RNJB-107');
    expect(code('https://example.com/some/page')).toBe('RNJB-107');
  });
});
