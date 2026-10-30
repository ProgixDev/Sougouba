import { BASE_FARE_CAD } from '@/data/courierPay';
import type { Order } from '@/data/types';

/**
 * What a courier's finished runs add up to.
 *
 * The courier twin of `lib/analytics.ts`, and it exists for the same reason:
 * aggregation that a screen can be reasoned about without mounting it. The
 * merchant module could not simply be reused — it sums `subtotalCad` over
 * *orders a shop sold*, and a courier is paid on `delivery.earningsCad` over
 * *runs they drove*, which is a different number over a different set.
 *
 * Every figure here is derived from `delivery.earningsCad`, frozen onto the
 * order when the run completed. Re-deriving pay from the rates in
 * `data/courierPay.ts` would silently rewrite history the day a rate changes —
 * see the note in `components/courier/EarningsSummary.tsx`.
 */

export interface RunBucket {
  /** `YYYY-MM-DD` in local time. */
  date: string;
  /** Short French label for a chart axis. */
  label: string;
  earningsCad: number;
  runCount: number;
  distanceKm: number;
}

export interface RunSummary {
  earningsCad: number;
  runCount: number;
  distanceKm: number;
  tipsCad: number;
  /** Mean payout per run — the figure a courier compares one night against another with. */
  avgPerRunCad: number;
  buckets: RunBucket[];
  /** The best day in the window, or null when nothing was earned in it. */
  bestDay: RunBucket | null;
}

/**
 * Summarise the last `days` days, ending today.
 *
 * `days = 1` is "today". Buckets are always emitted for the full window, empty
 * ones included, because a bar chart with days missing reads as a shorter week
 * rather than as a quiet Tuesday.
 */
export function summariseRuns(runs: Order[], days: number, now = new Date()): RunSummary {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));

  const buckets: RunBucket[] = [];
  const byDate = new Map<string, RunBucket>();
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const bucket: RunBucket = {
      date: toKey(day),
      label: labelFor(day, days),
      earningsCad: 0,
      runCount: 0,
      distanceKm: 0,
    };
    buckets.push(bucket);
    byDate.set(bucket.date, bucket);
  }

  const from = start.getTime();
  // The window ends at the end of today, not at `now` — a run delivered ten
  // minutes from now (which the seeded live orders can produce) still belongs
  // to today rather than falling outside the range.
  const to = endOfDay(now).getTime();

  let earningsCad = 0;
  let distanceKm = 0;
  let tipsCad = 0;
  let runCount = 0;

  for (const order of runs) {
    const delivery = order.delivery;
    if (!delivery) continue;
    const at = Date.parse(delivery.deliveredAt ?? order.createdAt);
    if (!Number.isFinite(at) || at < from || at > to) continue;

    earningsCad += delivery.earningsCad;
    distanceKm += delivery.distanceKm;
    tipsCad += delivery.tipCad;
    runCount += 1;

    const bucket = byDate.get(toKey(new Date(at)));
    if (bucket) {
      bucket.earningsCad = round2(bucket.earningsCad + delivery.earningsCad);
      bucket.runCount += 1;
      bucket.distanceKm = round1(bucket.distanceKm + delivery.distanceKm);
    }
  }

  const bestDay = buckets.reduce<RunBucket | null>(
    (best, bucket) =>
      bucket.earningsCad > 0 && (!best || bucket.earningsCad > best.earningsCad) ? bucket : best,
    null
  );

  return {
    earningsCad: round2(earningsCad),
    runCount,
    distanceKm: round1(distanceKm),
    tipsCad: round2(tipsCad),
    avgPerRunCad: runCount > 0 ? round2(earningsCad / runCount) : 0,
    buckets,
    bestDay,
  };
}

export interface RunComparison {
  current: RunSummary;
  previous: RunSummary;
  earningsDeltaPct: number | null;
  runDeltaPct: number | null;
  avgDeltaPct: number | null;
}

/**
 * This window against the one immediately before it.
 *
 * A courier reads a payout as a direction before an amount, the same way a
 * merchant reads takings — so the previous window is computed by the same
 * function shifted back, and the two cannot drift.
 */
export function compareRuns(runs: Order[], days: number, now = new Date()): RunComparison {
  const previousNow = new Date(now);
  previousNow.setDate(previousNow.getDate() - days);

  const current = summariseRuns(runs, days, now);
  const previous = summariseRuns(runs, days, previousNow);

  return {
    current,
    previous,
    earningsDeltaPct: percentChange(previous.earningsCad, current.earningsCad),
    runDeltaPct: percentChange(previous.runCount, current.runCount),
    avgDeltaPct: percentChange(previous.avgPerRunCad, current.avgPerRunCad),
  };
}

export interface RunDay {
  /** `YYYY-MM-DD`, newest first. */
  date: string;
  earningsCad: number;
  distanceKm: number;
  runs: Order[];
}

/**
 * Runs grouped into the days they were delivered on, newest first.
 *
 * A courier's history is read by shift, not as a flat feed: "what did Friday
 * come to" is the question, and a list of undifferentiated rows makes it one
 * the courier has to answer with their own arithmetic.
 */
export function groupRunsByDay(runs: Order[]): RunDay[] {
  const byDate = new Map<string, RunDay>();

  for (const order of runs) {
    const delivery = order.delivery;
    if (!delivery) continue;
    const at = Date.parse(delivery.deliveredAt ?? order.createdAt);
    if (!Number.isFinite(at)) continue;

    const date = toKey(new Date(at));
    const day = byDate.get(date) ?? { date, earningsCad: 0, distanceKm: 0, runs: [] };
    day.earningsCad = round2(day.earningsCad + delivery.earningsCad);
    day.distanceKm = round1(day.distanceKm + delivery.distanceKm);
    day.runs.push(order);
    byDate.set(date, day);
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The share of a payout that came from distance rather than the flat fee.
 *
 * Derived by subtraction rather than from the per-kilometre rate, for the
 * rounding reason `EarningsSummary` documents: each run's `earningsCad` was
 * rounded once at completion, so recomputing from raw kilometres lands cents
 * away from the total printed above it.
 */
export function splitEarnings(summary: RunSummary): {
  baseCad: number;
  distanceCad: number;
  tipsCad: number;
} {
  const baseCad = round2(summary.runCount * BASE_FARE_CAD);
  return {
    baseCad,
    distanceCad: round2(summary.earningsCad - baseCad - summary.tipsCad),
    tipsCad: summary.tipsCad,
  };
}

/**
 * When the next deposit lands, and what is riding on it.
 *
 * Payouts run weekly (the copy on the Gains screen has always said so), and
 * "chaque semaine" is not an answer to "when do I get paid". Friday, because
 * that is when every delivery platform in the province settles, and a courier
 * planning a weekend needs the day rather than the policy.
 */
export const PAYOUT_WEEKDAY = 5;

export function nextPayoutDate(now = new Date()): Date {
  const date = startOfDay(now);
  const delta = (PAYOUT_WEEKDAY - date.getDay() + 7) % 7;
  // A payout day that has already begun pays out *today*, not in seven days.
  date.setDate(date.getDate() + delta);
  return date;
}

/** Null rather than Infinity when there is no base — "up ∞ %" is not actionable. */
function percentChange(from: number, to: number): number | null {
  if (from <= 0) return null;
  return Math.round(((to - from) / from) * 100);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Local-time key, so an evening run doesn't land on the next UTC day. */
function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

function labelFor(date: Date, days: number): string {
  if (days <= 1) return 'auj.';
  return days <= 7 ? WEEKDAYS[date.getDay()] : String(date.getDate());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
