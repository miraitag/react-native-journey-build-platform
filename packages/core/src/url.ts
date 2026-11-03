/**
 * True when a URL carries credentials: any password, or an https user (a token can stand in for
 * one). An ssh user such as `git@` is not a secret. Nothing with credentials is ever stored (§6.4).
 */
export const hasCredentials = (url: {
  protocol: string;
  username: string;
  password: string;
}): boolean => url.password !== '' || (url.protocol === 'https:' && url.username !== '');
