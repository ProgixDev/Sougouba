import { plural } from '../plural';

/** Wording owned by `lib/format.ts` and `lib/geo.ts`. */
export const format = {
  /**
   * How long an order has been waiting, in the shop's terms.
   *
   * Hand-written rather than `Intl.RelativeTimeFormat` for two reasons: the
   * merchant queue needs the shop's shorthand ("il y a 12 min", not "il y a 12
   * minutes") to sit on one line beside a badge, and `RelativeTimeFormat` does
   * not exist in Hermes' Android `Intl` at all.
   *
   * French puts the marker in front, English behind — so each rung is one whole
   * string, never a marker glued to a number.
   */
  elapsed: {
    justNow: 'à l’instant',
    minutes: 'il y a %{count} min',
    hours: 'il y a %{count} h',
    /** `one` is suppletive: "hier", not "il y a 1 jour". */
    days: plural({ one: 'hier', other: 'il y a %{count} jours' }),
  },
  weekday: {
    short: { sun: 'dim', mon: 'lun', tue: 'mar', wed: 'mer', thu: 'jeu', fri: 'ven', sat: 'sam' },
    long: {
      sun: 'Dimanche',
      mon: 'Lundi',
      tue: 'Mardi',
      wed: 'Mercredi',
      thu: 'Jeudi',
      fri: 'Vendredi',
      sat: 'Samedi',
    },
    /** Chart axis label for the current day. Kept short — the bucket is narrow. */
    today: 'auj.',
  },
};
