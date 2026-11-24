/**
 * When a closed shop opens next, and how to say so.
 *
 * Whether a shop is open *now* is not decided here: that is `public.is_open`,
 * in the database, against the database's clock — the one rule the catalogue,
 * the shop page and checkout all read. This module only answers the follow-up
 * question a refused shopper has: "when, then?".
 *
 * Shops are in Quebec, so a week of hours is Montréal wall-clock time, whatever
 * timezone the server or the shopper's phone is in — the same reason the app's
 * `lib/shopHours.ts` gives.
 */

export interface ShopHours {
  /** 0 = Sunday, as `Date.getDay()` and Postgres's `dow`. */
  day: number;
  /** `HH:MM`, 24-hour. */
  open: string;
  close: string;
  closed: boolean;
}

export interface NextOpening {
  /** 0 = later today, 1 = tomorrow, up to 7 = this weekday next week. */
  daysAhead: number;
  day: number;
  /** `HH:MM`, as the shop wrote it. */
  open: string;
}

const SHOP_TIME_ZONE = 'America/Montreal';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** The weekday and the minutes since midnight in Montréal at `at`. */
export function montrealClock(at: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: WEEKDAYS.indexOf(get('weekday')), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function minutesOf(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The next time the shop opens, looking up to a week ahead. Null for a shop
 * that lists no opening at all — every day closed, or no hours on file.
 *
 * "Later today" only counts when the opening is still ahead: a shop that
 * closed for the night at 21:00 opens next tomorrow, not this morning.
 */
export function nextOpening(hours: ShopHours[], now: Date = new Date()): NextOpening | null {
  const clock = montrealClock(now);
  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const day = (clock.day + daysAhead) % 7;
    const entry = hours.find((h) => h.day === day && !h.closed);
    if (!entry) continue;
    const opens = minutesOf(entry.open);
    const closes = minutesOf(entry.close);
    if (opens === null || closes === null || closes <= opens) continue;
    // Today is only an answer while the opening is still to come.
    if (daysAhead === 0 && clock.minutes >= opens) continue;
    return { daysAhead, day, open: entry.open.slice(0, 5) };
  }
  return null;
}

/** `09:00` → `9 h`, `09:30` → `9 h 30` — how an hour is written in Quebec. */
function hourFr(clock: string): string {
  const [hours, minutes] = clock.split(':');
  return minutes === '00' ? `${Number(hours)} h` : `${Number(hours)} h ${minutes}`;
}

/**
 * The sentence a shopper reads when they try to order from a closed shop. In
 * French, like the other refusals a shopper sees at checkout; the app shows it
 * as it is.
 */
export function closedShopMessage(vendorName: string, next: NextOpening | null): string {
  const closed = `${vendorName} est fermé pour le moment`;
  if (!next) return `${closed}. Vous ne pouvez pas commander.`;
  const when =
    next.daysAhead === 0
      ? `aujourd’hui à ${hourFr(next.open)}`
      : next.daysAhead === 1
        ? `demain à ${hourFr(next.open)}`
        : `${DAY_NAMES_FR[next.day]} à ${hourFr(next.open)}`;
  return `${closed} : vous pourrez commander ${when}.`;
}
