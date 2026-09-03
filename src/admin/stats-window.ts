/**
 * Date arithmetic for `GET /admin/stats/overview`, kept pure and free of the
 * database so the part most likely to be subtly wrong is the part that is
 * cheapest to test.
 *
 * Everything here reckons in **Montreal wall-clock time**, not UTC. The
 * business is in Quebec, merchants open and close by the clock on their wall,
 * and `catalog/mappers.ts` already interprets `vendor_hours` that way. A
 * UTC-bucketed chart would file every evening order under the next day.
 */

export const REPORTING_TZ = 'America/Montreal';

/**
 * Milliseconds to add to a UTC instant to get the wall-clock reading in `tz`.
 * Negative for Montreal (UTC-5, or UTC-4 on daylight time).
 *
 * Derived from `Intl` rather than a timezone package: Node ships the full ICU
 * database, so this needs no dependency and cannot drift from the rules
 * Postgres itself applies.
 */
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const at = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  // `hour` is 00–23 under hour12:false in modern ICU, but older builds emit 24
  // for midnight — the modulo makes both read as 0.
  const asIfUtc = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'));
  return asIfUtc - instant.getTime();
}

/** The `yyyy-mm-dd` calendar date an instant falls on, in Montreal. */
export function montrealDate(instant: Date): string {
  // en-CA formats as yyyy-mm-dd, which is exactly the shape Postgres's
  // `to_char(…, 'YYYY-MM-DD')` produces on the other side of this comparison.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The UTC instant at which a Montreal calendar day begins.
 *
 * Solved rather than computed in one step: the offset to apply depends on the
 * instant, and the instant is what we are looking for. One refinement pass
 * settles it, which matters on the two days a year the offset changes — a
 * single-pass version lands an hour off on exactly those days, which is
 * precisely when nobody is looking.
 */
export function montrealMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const wallTarget = Date.UTC(year, month - 1, day, 0, 0, 0);

  let instant = wallTarget - tzOffsetMs(new Date(wallTarget), REPORTING_TZ);
  instant = wallTarget - tzOffsetMs(new Date(instant), REPORTING_TZ);
  return new Date(instant);
}

export type OverviewRange = 7 | 30 | 90;

export interface OverviewWindow {
  /** Montreal midnight, `range - 1` days before today — so the window covers `range` calendar days. */
  curStart: Date;
  /** Now. The last bucket is a partial day, which is what a dashboard wants. */
  curEnd: Date;
  prevStart: Date;
  /** Exactly `curStart`: the previous window ends where the current one begins, with no gap or overlap. */
  prevEnd: Date;
  /** `range` `yyyy-mm-dd` strings in Montreal, oldest first. */
  days: string[];
}

/**
 * The current window and the equal-length one before it, for period-over-period.
 *
 * Aligned to Montreal midnight rather than the rolling `now - N × 86400000`
 * the mock uses. That alignment is the point: with a rolling cutoff the
 * headline total slices a day in half while the daily series buckets by
 * calendar date, so `gmvCad` does not equal the sum of the bars. A dashboard
 * whose headline disagrees with its own chart is a support ticket.
 */
export function overviewWindow(range: OverviewRange, now: Date): OverviewWindow {
  const today = montrealDate(now);
  const [year, month, day] = today.split('-').map(Number);

  // Calendar-day arithmetic done in UTC on a bare date, which is immune to
  // DST: adding -1 day to a UTC midnight is always exactly 86400000 ms, so a
  // 30-day window spans 30 dates across a transition, never 29 or 31.
  const days: string[] = [];
  for (let back = range - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(year, month - 1, day - back));
    days.push(d.toISOString().slice(0, 10));
  }

  const curStart = montrealMidnight(days[0]);
  const prevFirstDay = new Date(Date.UTC(year, month - 1, day - (range - 1) - range)).toISOString().slice(0, 10);

  return {
    curStart,
    curEnd: now,
    prevStart: montrealMidnight(prevFirstDay),
    prevEnd: curStart,
    days,
  };
}

/** Two decimal places, the precision every money and percentage figure here reports at. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Period-over-period change, in percent.
 *
 * The zero guard is carried over verbatim from the dashboard's mock
 * (`admin/lib/api/stats.ts`): growth from nothing is reported as 0 %, not
 * `Infinity` and not `NaN`. Both of those render as literal text in a stat
 * card, and "Infinity%" next to a revenue figure is the kind of thing that
 * gets screenshotted.
 */
export function deltaPct(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return round2(((current - previous) / previous) * 100);
}
