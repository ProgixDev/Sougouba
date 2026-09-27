import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

/**
 * Authorization for the back office. Pairs with `SupabaseAuthGuard`, never
 * replaces it: that one proves *who* is calling, this one asks whether they are
 * entitled to arbitrate between other people's accounts.
 *
 * Always listed second — `@UseGuards(SupabaseAuthGuard, AdminGuard)` — because
 * it reads `request.userId`, which the first guard sets.
 *
 * The `admin` role exists only in the database. Nobody signs up as one: there is
 * no endpoint that grants it, `PATCH /me/role` accepts only the three consumer
 * roles, and the mobile app's `UserRole` union never grows a fourth value. An
 * administrator is made by an `update profiles set role = 'admin'` run by
 * whoever holds the service-role key — which is the correct amount of
 * ceremony for an account that can resolve disputes and move money.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const userId = request.userId;
    if (!userId) throw new UnauthorizedException('Missing bearer token');

    const profile = await unwrap<{ role: string } | null>(
      this.db.from('profiles').select('role').eq('id', userId).maybeSingle()
    );

    if (profile?.role !== 'admin') {
      // Deliberately the same answer whether the account is a shopper, a
      // merchant, or does not exist: "not an admin" is the whole reply, and
      // distinguishing the cases would confirm which accounts are real.
      throw new ForbiddenException('Administrator access required');
    }
    return true;
  }
}
