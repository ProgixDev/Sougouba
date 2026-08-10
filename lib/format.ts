const currencyFormatter = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function formatCad(amount: number): string {
  return currencyFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat('fr-CA', {
  day: 'numeric',
  month: 'long',
});

const timeFormatter = new Intl.DateTimeFormat('fr-CA', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

const monthYearFormatter = new Intl.DateTimeFormat('fr-CA', {
  month: 'long',
  year: 'numeric',
});

/** "août 2026" — for spans where the day would be noise, like a join date. */
export function formatMonthYear(iso: string): string {
  return monthYearFormatter.format(new Date(iso));
}

/**
 * How long an order has been waiting, in the shop's terms.
 *
 * The merchant queue is read by age before anything else — a ticket sitting for
 * forty minutes is the one that matters, whatever its status. Written by hand
 * rather than through `Intl.RelativeTimeFormat` so the wording is the shop's
 * ("il y a 12 min", not "il y a 12 minutes") and stays short enough to sit on
 * one line beside a badge.
 */
export function formatElapsed(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}
