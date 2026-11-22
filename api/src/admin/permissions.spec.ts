import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AdminGuard } from '../auth/admin.guard.js';
import { AdminPayoutsController } from '../billing/billing.controller.js';
import type { Db } from '../db/client.js';
import { AdminController } from './admin.controller.js';
import { ANY_ADMIN, PERMISSION_KEY, PERMISSIONS, RequirePermission } from './permissions.js';

/** Every route handler on a controller — the methods Nest has a verb for. */
function routes(controller: new (...args: never[]) => unknown) {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, handler: controller.prototype[name] as object }))
    .filter(({ handler }) => Reflect.getMetadata(METHOD_METADATA, handler) !== undefined);
}

describe('every admin route declares a permission', () => {
  for (const controller of [AdminController, AdminPayoutsController]) {
    for (const { name, handler } of routes(controller as never)) {
      it(`${controller.name}.${name}`, () => {
        const permission = Reflect.getMetadata(PERMISSION_KEY, handler);
        expect(permission, 'missing @RequirePermission — AdminGuard would refuse it').toBeDefined();
        expect([...PERMISSIONS, ANY_ADMIN]).toContain(permission);
      });
    }
  }

  it('leaves no permission in the catalogue unused by a route', () => {
    const used = new Set(
      [AdminController, AdminPayoutsController].flatMap((c) =>
        routes(c as never).map(({ handler }) => Reflect.getMetadata(PERMISSION_KEY, handler))
      )
    );
    expect(PERMISSIONS.filter((p) => !used.has(p))).toEqual([]);
  });
});

describe('the built-in Propriétaire role', () => {
  it('holds every permission in the catalogue, so the owner is never locked out of a new screen', () => {
    const sql = readFileSync(fileURLToPath(new URL('../../drizzle/0043_admin_roles.sql', import.meta.url)), 'utf8');
    const owner = sql.match(/\('owner',[\s\S]*?array\[([\s\S]*?)\]\)/);
    expect(owner).not.toBeNull();
    const granted = [...owner![1].matchAll(/'([a-z_]+\.[a-z]+)'/g)].map((m) => m[1]);
    // Permissions added after 0043 are granted by `array_append` in their own migration.
    const drizzle = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    for (const file of readdirSync(drizzle).filter((f) => f.endsWith('.sql') && f > '0043')) {
      const later = readFileSync(`${drizzle}${file}`, 'utf8');
      for (const m of later.matchAll(/array_append\(permissions, '([a-z_]+\.[a-z]+)'\)[\s\S]*?slug in \(([^)]*)\)/g)) {
        if (m[2].includes("'owner'")) granted.push(m[1]);
      }
    }
    expect(new Set(granted)).toEqual(new Set(PERMISSIONS));
  });
});

describe('AdminGuard', () => {
  class Routes {
    @RequirePermission('orders.refund')
    refund() {}

    @RequirePermission(ANY_ADMIN)
    me() {}

    undeclared() {}
  }

  function guardFor(profile: { role: string; adminRole: { permissions: string[] } | null } | null) {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: profile, error: null }),
    };
    return new AdminGuard({ from: () => query } as unknown as Db, new Reflector());
  }

  function context(handler: () => void) {
    const request = { userId: 'admin-1', method: 'POST', url: '/admin/x' } as Record<string, unknown>;
    return {
      request,
      ctx: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => Routes,
      } as never,
    };
  }

  it('lets through a role that holds the permission, and records the permissions', async () => {
    const { ctx, request } = context(Routes.prototype.refund);
    await expect(guardFor({ role: 'admin', adminRole: { permissions: ['orders.refund'] } }).canActivate(ctx)).resolves.toBe(true);
    expect(request.adminPermissions).toEqual(['orders.refund']);
  });

  it('refuses a role without it', async () => {
    const { ctx } = context(Routes.prototype.refund);
    await expect(
      guardFor({ role: 'admin', adminRole: { permissions: ['orders.view'] } }).canActivate(ctx)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets any administrator through a route marked for any administrator', async () => {
    const { ctx } = context(Routes.prototype.me);
    await expect(guardFor({ role: 'admin', adminRole: { permissions: [] } }).canActivate(ctx)).resolves.toBe(true);
  });

  it('refuses a route that declares nothing — fail closed', async () => {
    const { ctx } = context(Routes.prototype.undeclared);
    await expect(
      guardFor({ role: 'admin', adminRole: { permissions: [...PERMISSIONS] } }).canActivate(ctx)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a non-administrator before looking at permissions', async () => {
    const { ctx } = context(Routes.prototype.me);
    await expect(guardFor({ role: 'customer', adminRole: null }).canActivate(ctx)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
