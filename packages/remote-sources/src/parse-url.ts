import { RnjbError, hasCredentials } from '@rnjb/core';

export type RemoteProvider = 'bitbucket-cloud' | 'bitbucket-data-center' | 'git';

/** What a pasted URL says; the user confirms or corrects each part (§6.4). */
export interface ParsedRemoteUrl {
  provider: RemoteProvider;
  /** Clone URL (https or ssh). */
  remote: string;
  /** Absent when the URL does not name a branch, tag or commit: the user must provide it. */
  ref?: string;
  /** Folder inside the repository, without leading or trailing slash. */
  path: string;
}

export type ParseRemoteUrlResult =
  { ok: true; value: ParsedRemoteUrl } | { ok: false; error: RnjbError };

const fail = (code: 'RNJB-105' | 'RNJB-107' | 'RNJB-109', url: string): ParseRemoteUrlResult => ({
  ok: false,
  error: new RnjbError(code, { url }),
});

const REF_PREFIX = /^refs\/(heads|tags)\//;

function segmentsOf(pathname: string): string[] | undefined {
  try {
    const segments = pathname
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
    return segments.some((segment) => segment === '..' || segment === '.' || segment.includes('\0'))
      ? undefined
      : segments;
  } catch {
    return undefined;
  }
}

const stripGit = (name: string): string => name.replace(/\.git$/, '');

function build(
  provider: RemoteProvider,
  remote: string,
  ref: string | undefined,
  folder: string[],
): ParseRemoteUrlResult {
  const value: ParsedRemoteUrl = { provider, remote, path: folder.join('/') };
  if (ref) value.ref = ref;
  return { ok: true, value };
}

/**
 * Splits a Bitbucket browser URL (Cloud or Data Center) or a plain git URL into remote, ref and
 * folder. Only https and ssh are accepted. A Cloud URL does not say where the branch name ends
 * (`src/feature/x/dir`): the first segment is taken as the ref and the user confirms it.
 */
export function parseRemoteUrl(input: string): ParseRemoteUrlResult {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail('RNJB-107', input);
  }
  // The input is echoed in the error, so never with its secret.
  if (hasCredentials(url)) return fail('RNJB-109', `${url.protocol}//${url.host}${url.pathname}`);
  if (url.protocol === 'ssh:') {
    // The ssh user (usually `git@`) is part of the address, not a secret.
    const user = url.username ? `${url.username}@` : '';
    return url.hostname
      ? build('git', `${url.protocol}//${user}${url.host}${url.pathname}`, undefined, [])
      : fail('RNJB-107', input);
  }
  if (url.protocol !== 'https:') return fail('RNJB-105', input);
  const segments = segmentsOf(url.pathname);
  if (!segments) return fail('RNJB-107', input);

  if (url.hostname === 'bitbucket.org' || url.hostname === 'www.bitbucket.org') {
    const [workspace, repository, view, ref, ...folder] = segments;
    if (!workspace || !repository) return fail('RNJB-107', input);
    const remote = `https://bitbucket.org/${workspace}/${stripGit(repository)}.git`;
    return view === 'src'
      ? build('bitbucket-cloud', remote, ref, folder)
      : build('bitbucket-cloud', remote, undefined, []);
  }

  // Data Center / Server: [/context]/projects/KEY/repos/REPO/browse/... or /users/NAME/repos/...
  const marker = segments.findIndex(
    (segment, index) =>
      (segment === 'projects' || segment === 'users') && segments[index + 2] === 'repos',
  );
  if (marker >= 0) {
    const owner = segments[marker + 1];
    const repository = segments[marker + 3];
    if (!owner || !repository) return fail('RNJB-107', input);
    const context = segments.slice(0, marker).map(encodeURIComponent).join('/');
    const scmOwner = segments[marker] === 'users' ? `~${owner.toLowerCase()}` : owner.toLowerCase();
    const remote = `${url.origin}${context ? `/${context}` : ''}/scm/${encodeURIComponent(scmOwner)}/${encodeURIComponent(repository)}.git`;
    const rest = segments.slice(marker + 4);
    const at = url.searchParams.get('at')?.replace(REF_PREFIX, '');
    return rest[0] === 'browse'
      ? build('bitbucket-data-center', remote, at || undefined, rest.slice(1))
      : build('bitbucket-data-center', remote, at || undefined, []);
  }

  if (url.pathname.endsWith('.git') && segments.length > 0) {
    return build('git', `${url.origin}${url.pathname}`, undefined, []);
  }
  return fail('RNJB-107', input);
}
