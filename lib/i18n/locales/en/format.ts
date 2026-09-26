import type { Widen } from '../../types';
import type { format as reference } from '../fr/format';
import { plural } from '../plural';

export const format: Widen<typeof reference> = {
  elapsed: {
    justNow: 'just now',
    minutes: '%{count} min ago',
    hours: '%{count} h ago',
    days: plural({ one: 'yesterday', other: '%{count} days ago' }),
  },
  weekday: {
    /** Three characters, like the French — the chart axis is `text-[9px]`. */
    short: { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' },
    long: {
      sun: 'Sunday',
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
    },
    today: 'today',
  },
};
