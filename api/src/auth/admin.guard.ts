import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { ANY_ADMIN, PERMISSION_KEY } from '../admin/permissions.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

/**
 * Authorization for the back office. Pairs with `SupabaseAuthGuard`, never
 * replaces it: that one proves *who* is calling, this one asks whether they are
 * entitled to arbitrate between other people's accounts — and, since roles
 * (`0043`), whether *this* administrator may do *this* thing.
 *
 * Always listed second — `@UseGuards(SupabaseAuthGuard, AdminGuard)` — because
 * it reads `request.userId`, which the first guard sets.
 *
 * Two checks, both read from the database on every request, so a revoke or a
 * role change takes effect on the next call rather than when a token expires:
 *   1. the account is an administrator (`profiles.role = 'admin'`);
 *   2. its role holds the permission the route declares (`@RequirePermission`).
 *
 * **Fail closed.** A route with no declared permission is refused, with a
 * log line saying so — `permissions.spec.ts` keeps that from shipping.
 *
 * Nobody signs up as an administrator: `PATCH /me/role` accepts only the three
 * consumer roles. Administrators are made from the back office itself
 * (`AdminAccountsService`), by someone holding `admins.manage`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const userId = request.userId;
    if (!userId) throw new UnauthorizedException('Missing bearer token');

    const profile = await unwrap<{ role: string; adminRole: { permissions: string[] } | null } | null>(
      this.db
        .from('profiles')
        .select('role, adminRole:admin_roles(permissions)')
        .eq('id', userId)
        .maybeSingle()
    );
    if (profile?.role !== 'admin') {
      // Deliberately the same answer whether the account is a shopper, a
      // merchant, or does not exist: "not an admin" is the whole reply, and
      // distinguishing the cases would confirm which accounts are real.
      throw new ForbiddenException('Administrator access required');
    }

    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      this.logger.error(`Admin route without a permission refused: ${request.method} ${request.url}`);
      throw new ForbiddenException('Administrator access required');
    }

    const permissions = profile.adminRole?.permissions ?? [];
    request.adminPermissions = permissions;
    if (required !== ANY_ADMIN && !permissions.includes(required)) {
      throw new ForbiddenException('Votre rôle ne permet pas cette action.');
    }
    return true;
  }
}
