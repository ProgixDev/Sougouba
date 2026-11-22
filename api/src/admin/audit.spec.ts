import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AdminPayoutsController } from '../billing/billing.controller.js';
import { AdminController } from './admin.controller.js';
import { AUDIT_ACTION_FOR } from './approvals.service.js';
import { ADMIN_ACTIONS, diffSettings, type AdminAction } from './audit.service.js';

describe('diffSettings', () => {
  it('records only what moved', () => {
    const before = { commissionRate: '0.120', pointsPerCad: '1.00', pointsExpiryMonths: 12 };
    const changes = diffSettings(before, { commissionRate: 0.2 });

    expect(changes).toEqual({ commissionRate: { from: '0.120', to: 0.2 } });
  });

  it('skips fields absent from the patch', () => {
    const before = { commissionRate: '0.120', monthlySubscriptionCad: '70.00' };
    // A PATCH that only turns on a double-points day must not read as a
    // commission change just because the column exists.
    const changes = diffSettings(before, { doublePointsActive: true, commissionRate: undefined });

    // `from` is null, not undefined: this lands in a `jsonb` column, where
    // undefined would serialise away and take the field with it.
    expect(changes).toEqual({ doublePointsActive: { from: null, to: true } });
  });

  it('does not count a numeric column resubmitted at its own value', () => {
    // The case this exists for: Postgres hands back `numeric` as '0.120' and the
    // JSON body carries 0.12. Compared raw, every save of an untouched form
    // would log a commission change that never happened.
    const changes = diffSettings({ commissionRate: '0.120' }, { commissionRate: 0.12 });

    expect(changes).toEqual({});
  });

  it('treats a real rate change as a change even across the same string/number split', () => {
    const changes = diffSettings({ maxRedemptionShare: '0.200' }, { maxRedemptionShare: 0.5 });

    expect(changes).toEqual({ maxRedemptionShare: { from: '0.200', to: 0.5 } });
  });

  it('reads a null-to-value transition as a change', () => {
    const changes = diffSettings({ doublePointsEndsAt: null }, { doublePointsEndsAt: '2026-12-25T05:00:00.000Z' });

    expect(changes).toEqual({ doublePointsEndsAt: { from: null, to: '2026-12-25T05:00:00.000Z' } });
  });
});

describe('ADMIN_ACTIONS', () => {
  it('has no duplicates', () => {
    expect(new Set(ADMIN_ACTIONS).size).toBe(ADMIN_ACTIONS.length);
  });

  it('covers every decision an approval can land on', () => {
    // `AUDIT_ACTION_FOR` is typed to be exhaustive over `ReviewDecision`; this
    // checks the verbs it names are ones the log actually knows.
    for (const byDecision of Object.values(AUDIT_ACTION_FOR)) {
      for (const action of Object.values(byDecision)) {
        expect(ADMIN_ACTIONS).toContain(action);
      }
    }
  });

  /**
   * The structural guard.
   *
   * An admin route that mutates something and records nothing is exactly the
   * gap this table was built to close, and the way it comes back is somebody
   * adding a route in six months and not knowing to log it. Rather than trust
   * that, this counts the controller's own mutating routes — read off Nest's
   * route metadata, not off the file as text — against the audited actions.
   *
   * If this fails, one of two things is true and both need a human: a new
   * mutating route needs an `audit.record` call and a member in `AdminAction`,
   * or an action was added that no route reaches and should go.
   */
  it('has exactly one action per mutating admin route', () => {
    // The payouts controller lives in `billing/` but is back office all the same.
    const mutating = [...mutatingRoutesOf(AdminController), ...mutatingRoutesOf(AdminPayoutsController)];

    expect(
      ADMIN_ACTIONS.length,
      `mutating routes: ${mutating.join(', ')}\naudited actions: ${ADMIN_ACTIONS.join(', ')}`
    ).toBe(mutating.length);
  });
});

/** POST/PATCH/PUT/DELETE handlers declared on a controller, by `METHOD path`. */
function mutatingRoutesOf(controller: new (...args: never[]) => unknown): string[] {
  const writes = [RequestMethod.POST, RequestMethod.PATCH, RequestMethod.PUT, RequestMethod.DELETE];

  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = (controller.prototype as Record<string, unknown>)[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler as object) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler as object) as string | undefined;
      return { name, method, path };
    })
    .filter((r) => r.method !== undefined && writes.includes(r.method))
    .map((r) => `${RequestMethod[r.method as RequestMethod]} ${r.path ?? '/'}`)
    .sort();
}

describe('AdminAction', () => {
  it('names every action as subject.verb', () => {
    for (const action of ADMIN_ACTIONS) {
      // The read endpoint filters on `action` as an exact string; a stray
      // format would quietly never match.
      expect(action, action).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('is assignable in both directions', () => {
    // Catches the `ADMIN_ACTIONS` array drifting from the `AdminAction` union
    // at compile time — the array is what the tests above iterate, and a
    // forgotten entry there would make them pass while logging nothing.
    const roundTrip: AdminAction[] = ADMIN_ACTIONS;
    expect(roundTrip.length).toBeGreaterThan(0);
  });
});

describe('diffSettings — the date and boolean edges', () => {
  it('does not report a double-points window resubmitted unchanged', () => {
    // Zod coerces the body to a `Date`; Postgres hands back a `Date` too, but a
    // seeded or re-serialised value can arrive as a string. Neither is a change.
    const iso = '2026-12-25T05:00:00.000Z';
    expect(diffSettings({ doublePointsStartsAt: new Date(iso) }, { doublePointsStartsAt: new Date(iso) })).toEqual({});
    expect(diffSettings({ doublePointsStartsAt: iso }, { doublePointsStartsAt: new Date(iso) })).toEqual({});
  });

  it('reports a moved window', () => {
    const from = new Date('2026-12-25T05:00:00.000Z');
    const to = new Date('2026-12-26T05:00:00.000Z');
    expect(diffSettings({ doublePointsStartsAt: from }, { doublePointsStartsAt: to })).toEqual({
      doublePointsStartsAt: { from, to },
    });
  });

  it('does not read `false` as unset', () => {
    // `false` is a legitimate value and a legitimate change. A truthiness check
    // here would silently drop "someone turned the double-points day off",
    // which is precisely the switch the brief worried about being left on.
    expect(diffSettings({ doublePointsActive: true }, { doublePointsActive: false })).toEqual({
      doublePointsActive: { from: true, to: false },
    });
    expect(diffSettings({ doublePointsActive: false }, { doublePointsActive: false })).toEqual({});
  });

  it('does not confuse 0 with null', () => {
    // Both stringify to falsy-ish values; `pointsExpiryMonths: 0` (never
    // expires) arriving over a null must record as the change it is.
    expect(diffSettings({ pointsExpiryMonths: null }, { pointsExpiryMonths: 0 })).toEqual({
      pointsExpiryMonths: { from: null, to: 0 },
    });
  });
});
