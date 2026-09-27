import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { Env } from '../config/env.js';

/**
 * Authentication, not authorization: this guard only proves *who* is
 * calling — a valid, unexpired Supabase-issued access token — and attaches
 * `request.userId` from the token's `sub` claim. What that id is allowed to
 * do is each route's own concern (an ownership check in the service layer,
 * same as the DB's RLS policies do independently as defense in depth).
 *
 * Verifies against this project's own JWKS rather than a shared secret —
 * see `SUPABASE_URL`'s comment in `config/env.ts` for why. `createRemoteJWKSet`
 * caches the fetched keys itself and re-fetches on a signing-key rotation, so
 * this is safe to construct once and reuse for the guard's lifetime.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService<Env, true>) {
    const supabaseUrl = config.get('SUPABASE_URL', { infer: true });
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      if (typeof payload.sub !== 'string') throw new Error('Token has no subject');
      request.userId = payload.sub;
      return true;
    } catch {
      // Never echo the underlying `jose` error (algorithm/claim detail) back
      // to the caller — "unauthorized" is the whole answer a client needs.
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}
