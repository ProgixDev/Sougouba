import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** The authenticated caller's id, as `SupabaseAuthGuard` attached it. Only valid on a route guarded by it. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!request.userId) {
    // A route used `@CurrentUser()` without `@UseGuards(SupabaseAuthGuard)` —
    // a wiring mistake, not a client error, so it fails loudly rather than
    // handing a controller `undefined` it might not check for.
    throw new Error('@CurrentUser() used on a route with no SupabaseAuthGuard');
  }
  return request.userId;
});
