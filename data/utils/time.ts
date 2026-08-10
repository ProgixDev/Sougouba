/**
 * Timestamp helpers for seeded data, in the device's own time zone.
 *
 * Seeded data is dated *relative to the moment the app launches*, never with
 * fixed calendar dates. A prototype demoed weeks after it was written otherwise
 * opens on a shop whose last order was a month ago: the dashboard reads zero,
 * the 7-day chart is blank, and the queue is empty — exactly the screens the
 * demo exists to show. Everything here exists to make "three days ago at 18:40"
 * expressible without pinning it to a date.
 *
 * ⚠️ **No `Intl` here, deliberately.** The first version resolved Montréal's
 * wall clock through `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto',
 * timeZoneName: 'longOffset' })` and parsed the result by splitting on `-`.
 * That assumes an engine whose `Intl` supports arbitrary IANA zones, the
 * `longOffset` option, and an exact `YYYY-MM-DD` rendering. Where any of those
 * does not hold the parse yields `NaN`, every timestamp becomes an invalid date,
 * and `toISOString()` throws `RangeError` — **inside a module-level loop that
 * builds ~600 orders at import time**, so the app dies before a single screen
 * mounts and before any error boundary exists. A seed must not be able to take
 * the app down.
 *
 * The device's own clock is used instead: it cannot throw, it needs no ICU data,
 * and on the phones this is built for (a Quebec app, on Quebec devices) it *is*
 * Montréal time. A demo run elsewhere shows plausible local times, which is
 * better than a crash.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `+HH:MM` / `-HH:MM` for the device's offset at a given instant, DST included. */
function offsetSuffix(date: Date): string {
  // getTimezoneOffset is minutes *behind* UTC, so the sign is inverted.
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** An instant as local wall-clock time with an explicit offset. */
export function localIso(epochMs: number): string {
  const d = new Date(epochMs);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetSuffix(d)}`
  );
}

/** `minutesAgo` before now. */
export function localMinutesAgo(minutes: number, now: number = Date.now()): string {
  return localIso(now - minutes * 60_000);
}

/**
 * "`daysAgo` days ago at `hour`:`minute`."
 *
 * The Date constructor normalises out-of-range day numbers, so this rolls month
 * and year boundaries correctly, and resolves the offset for *that* date — a
 * range spanning the daylight-time switch stays correct.
 */
export function localIsoAt(daysAgo: number, hour: number, minute: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0);
  return localIso(d.getTime());
}

/** Weekday (0 = Sunday, matching `VendorHours.day`) of the date `daysAgo` before now. */
export function localWeekday(daysAgo: number, now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo).getDay();
}

/**
 * Shift a timestamp by minutes.
 *
 * Returns the input unchanged if it does not parse, rather than propagating an
 * invalid date into `localIso` — the seed builds every order's status history
 * through here at import time, and one bad value must not become a crash.
 */
export function addMinutesIso(iso: string, minutes: number): string {
  const base = new Date(iso).getTime();
  if (Number.isNaN(base)) return iso;
  return localIso(base + minutes * 60_000);
}

/** Minutes since midnight for a `"HH:MM"` clock string. */
export function minutesOfDay(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}
