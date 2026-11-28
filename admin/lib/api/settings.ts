import { apiGet, apiPatch } from './client';
import type { PlatformSettings } from '../types';

/**
 * The platform rates an administrator controls — CDC §05's commission and
 * subscription, plus the loyalty constants.
 *
 * The mock seeded these from the mobile app's own hardcoded constants
 * (`lib/monetization.ts`, `data/loyalty.ts`) and stored edits in localStorage.
 * Those imports are gone: `platform_settings` is a real singleton row now, and
 * it is the record those constants were always meant to become. The mobile app
 * still hardcodes its copies — reading them from here is a separate job.
 *
 * The API returns a superset of what this screen edits (retention periods,
 * double-points scheduling), so unknown fields simply pass through untouched.
 */
export async function getSettings(): Promise<PlatformSettings> {
  return apiGet<PlatformSettings>('/admin/settings');
}

/**
 * A partial update — the endpoint is a PATCH and rejects an empty body.
 *
 * Every field carries the bound its column actually holds, so an impossible
 * value comes back as a 400 with a field-level message rather than a Postgres
 * overflow. `maxRedemptionShare` and `commissionRate` are shares between 0 and
 * 1, not percentages; the settings screen already presents them that way.
 */
export async function updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  return apiPatch<PlatformSettings>('/admin/settings', patch);
}

/** What requiring the subscription would do today — see `getSubscriptionImpact`. */
export interface SubscriptionImpact {
  /** Shops that are live, or offline for their subscription. */
  shops: number;
  /** How many of them have no subscription in order. */
  notInOrder: number;
  /** False when requiring it would do nothing: no monthly amount is set, or the server cannot reach Stripe. */
  enforceable: boolean;
  graceDays: number;
}

/**
 * How many shops would be offline if the subscription were required — asked
 * before the switch is turned on, so nobody takes most of the catalogue down
 * without having been told.
 */
export async function getSubscriptionImpact(): Promise<SubscriptionImpact> {
  return apiGet<SubscriptionImpact>('/admin/settings/subscription-impact');
}
