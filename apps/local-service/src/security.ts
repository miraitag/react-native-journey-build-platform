import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RnjbError } from '@rnjb/core';

export interface SecurityOptions {
  port: number;
  allowedOrigins: readonly string[];
  token: string;
}

export const createSessionToken = (): string => randomBytes(32).toString('base64url');

export function tokensMatch(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PUBLIC_ROUTES = new Set(['GET /v1/health']);
const TOKENLESS_ROUTES = new Set(['POST /v1/session']);

/**
 * ADR 0004: Host check (DNS rebinding), Origin allow-list (CSRF), CORS and bearer token.
 * Registered as the first `onRequest` hook.
 */
export function securityHook(options: SecurityOptions) {
  const allowedHosts = new Set([`127.0.0.1:${options.port}`, `localhost:${options.port}`]);
  const allowedOrigins = new Set(options.allowedOrigins);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const route = `${request.method} ${request.url.split('?')[0]}`;

    if (!allowedHosts.has(request.headers.host ?? '')) {
      throw new RnjbError('RNJB-402', { reason: 'host' });
    }

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) throw new RnjbError('RNJB-402', { reason: 'origin' });
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
      reply.header('access-control-allow-headers', 'authorization, content-type');
      reply.header('access-control-allow-methods', 'GET, POST, PUT, DELETE');
      reply.header('access-control-max-age', '600');
    }

    if (request.method === 'OPTIONS') {
      if (origin === undefined) throw new RnjbError('RNJB-402', { reason: 'origin' });
      return reply.code(204).send();
    }

    if (PUBLIC_ROUTES.has(route)) return;
    if (origin === undefined) throw new RnjbError('RNJB-402', { reason: 'origin' });
    if (TOKENLESS_ROUTES.has(route)) return;

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!tokensMatch(options.token, token)) throw new RnjbError('RNJB-402', { reason: 'token' });
  };
}
