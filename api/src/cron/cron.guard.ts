import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import type { Env } from '../config/env.js';

/**
 * Lets the platform's scheduler in, and nobody else.
 *
 * These routes run the jobs that pay couriers, re-offer orders and delete
 * data. They take no user token — there is no user — so the only thing
 * standing between `/internal/cron/payouts` and the open internet is this
 * comparison. Vercel sends `Authorization: Bearer <CRON_SECRET>` on every cron
 * invocation; anything else is refused.
 *
 * **An unset `CRON_SECRET` refuses everything** rather than allowing
 * everything. A deploy that forgot the variable then has no scheduled work,
 * which is a visible, recoverable problem — the opposite default would hand a
 * stranger the payout button, which is not.
 */
@Injectable()
export class CronGuard implements CanActivate {
  private readonly logger = new Logger(CronGuard.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get('CRON_SECRET', { infer: true });
    if (!secret) {
      this.logger.error('Refused a cron call: CRON_SECRET is unset, so no scheduled job can run.');
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;
    if (!header || !timingSafeEqual(header, `Bearer ${secret}`)) {
      // No detail about which part failed, and the caller is never told
      // whether the secret merely has the wrong length.
      this.logger.warn(`Refused a cron call to ${request.url}: bad or missing bearer token.`);
      throw new UnauthorizedException();
    }

    return true;
  }
}

/**
 * Constant-time string comparison.
 *
 * `===` on a secret leaks its prefix through timing: it returns on the first
 * differing byte, so a caller can learn the secret one character at a time.
 * The length is compared first and leaks only the length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
