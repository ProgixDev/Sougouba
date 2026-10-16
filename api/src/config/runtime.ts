import type { Env } from './env.js';

/**
 * Whether this process is a serverless function rather than a long-lived server.
 *
 * It decides who drives the background work. On a VPS the in-process timers in
 * `courier/dispatch.scheduler.ts`, `billing/payouts.scheduler.ts` and
 * `admin/retention.scheduler.ts` own it, exactly as they were built and tested.
 * On a serverless host there is no process between requests for a timer to live
 * in, so the same methods are driven over HTTP instead — by platform cron
 * (`cron/cron.controller.ts`) and, for dispatch, by the requests that care
 * about it (`DispatchScheduler.nudge`).
 *
 * `VERCEL` is set by Vercel itself on every deployment, so the Vercel case
 * needs no configuration. `SERVERLESS` is the manual override for any other
 * host of the same shape, and for reproducing this locally.
 *
 * Deliberately *not* defaulted on: a missing or misspelled variable must fall
 * back to the long-running behaviour, because that path keeps working on a
 * serverless host (it just wastes timers) while the reverse — a VPS where
 * nothing drives dispatch because the API thinks cron will — silently stops
 * couriers ever being offered an order.
 */
export function isServerless(env: Pick<Env, 'VERCEL' | 'SERVERLESS'>): boolean {
  return truthy(env.VERCEL) || truthy(env.SERVERLESS);
}

function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}
