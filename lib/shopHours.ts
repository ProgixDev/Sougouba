import type { Vendor, VendorHours } from '@/data/types';
import { minutesOfDay } from '@/data/utils/time';
import type { Message } from '@/lib/i18n';

export interface ShopDay {
  /** Today's entry from the vendor's week, or null if the shop lists no hours for today. */
  hours: VendorHours | null;
  closedToday: boolean;
  /** Minutes since midnight. */
  openMinutes: number;
  closeMinutes: number;
  nowMinutes: number;
  /** Trading right now. */
  isOpen: boolean;
  /** 0 before opening, 1 after closing — where "now" sits in the trading day. */
  progress: number;
}

/**
 * The shops are in Quebec, so their hours are Montréal wall-clock time — not the
 * phone's. Reading `getDay()`/`getHours()` from the device showed every shop as
 * "fermé · rouvre demain" to anyone viewing from another timezone (a client
 * demoing from abroad, a traveller ordering home), while the server — which
 * evaluates `is_open` in America/Montreal — was taking their orders.
 */
const SHOP_TIME_ZONE = 'America/Montreal';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function montrealClock(at: Date): { day: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SHOP_TIME_ZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const day = WEEKDAYS.indexOf(get('weekday'));
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    if (day >= 0 && Number.isFinite(minutes)) return { day, minutes };
  } catch {
    // No time-zone data on this runtime: the phone's clock is the best left.
  }
  return { day: at.getDay(), minutes: at.getHours() * 60 + at.getMinutes() };
}

/** Today's weekday (0 = Sunday) where the shops are. */
export function shopWeekday(now: Date = new Date()): number {
  return montrealClock(now).day;
}

/**
 * Where the shop is in its own day.
 *
 * A merchant's unit of time is the trading day, not the calendar week: the
 * dashboard opens on "am I open, how far through, how has it gone". Everything
 * needed to draw that comes from `vendor.hours` plus the clock, so it lives here
 * rather than being recomputed in each screen.
 */
export function shopDay(vendor: Vendor, now: Date = new Date()): ShopDay {
  const clock = montrealClock(now);
  const hours = vendor.hours.find((h) => h.day === clock.day) ?? null;
  const nowMinutes = clock.minutes;
  const closedToday = !hours || Boolean(hours.closed);

  if (!hours || closedToday) {
    return {
      hours,
      closedToday: true,
      openMinutes: 0,
      closeMinutes: 0,
      nowMinutes,
      isOpen: false,
      progress: 0,
    };
  }

  const openMinutes = minutesOfDay(hours.open);
  const closeMinutes = minutesOfDay(hours.close);
  const span = Math.max(1, closeMinutes - openMinutes);

  return {
    hours,
    closedToday: false,
    openMinutes,
    closeMinutes,
    nowMinutes,
    isOpen: nowMinutes >= openMinutes && nowMinutes < closeMinutes,
    progress: clamp01((nowMinutes - openMinutes) / span),
  };
}

/**
 * Can an order be placed with this shop right now?
 *
 * What decides whether an "add to cart" or a "pay" button is live. The server
 * decides again when the order is priced and when the payment is created
 * (`public.is_open`, the same hours on its own clock), so a button that is a
 * minute out of date is refused there, before any money moves.
 */
export function isShopOpen(vendor: Vendor, now: Date = new Date()): boolean {
  return shopDay(vendor, now).isOpen;
}

/**
 * One line telling the merchant their trading state.
 *
 * Phrased as what happens next rather than as a status word — "ferme à 21:00" is
 * actionable where "Ouvert" alone is not.
 *
 * Returns the message to render rather than the sentence: three of the four
 * branches interpolate a time, and picking the branch is this module's job while
 * saying it in a language is the screen's.
 */
export function shopStatusLine(day: ShopDay): Message {
  if (day.closedToday) return { key: 'domain.shopHours.closedToday' };
  if (day.isOpen) return { key: 'domain.shopHours.openUntil', params: { time: day.hours!.close } };
  if (day.nowMinutes < day.openMinutes) {
    return { key: 'domain.shopHours.opensAt', params: { time: day.hours!.open } };
  }
  return { key: 'domain.shopHours.reopensTomorrow' };
}

/**
 * Where a timestamp falls across the trading day, as 0–1.
 *
 * Clamped rather than rejected. An order placed before the shop opened is real —
 * someone ordering ahead — and dropping it would let the strip show fewer orders
 * than the queue beside it counts. It sits at the start of the day instead,
 * which is where it is waiting. Null only when the shop does not trade today, in
 * which case there is no track to place it on.
 */
export function positionInDay(day: ShopDay, iso: string): number | null {
  if (day.closedToday) return null;
  const { minutes } = montrealClock(new Date(iso));
  return clamp01((minutes - day.openMinutes) / Math.max(1, day.closeMinutes - day.openMinutes));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
