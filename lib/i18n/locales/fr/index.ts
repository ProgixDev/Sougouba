import { auth } from './auth';
import { business } from './business';
import { common } from './common';
import { courier } from './courier';
import { customer } from './customer';
import { domain } from './domain';
import { format } from './format';
import { onboarding } from './onboarding';
import { validation } from './validation';

/**
 * The reference catalogue. French is the source of truth for *shape*: the key
 * union in `lib/i18n/types.ts` derives from this object, so a key that exists
 * only in English does not compile, and one missing from English fails the
 * `Catalogue` annotation in `locales/en/index.ts`.
 *
 * Three authoring rules, all of them load-bearing:
 *
 *  1. **Nothing here may import at runtime.** No `i18n-js`, no
 *     `expo-localization`, no `@/theme`. `scripts/verify-i18n.ts` reads these
 *     files under bare `tsx` with no React Native resolver, and the moment one
 *     of them reaches for a native module that check stops working.
 *  2. **Interpolation is `%{name}`, never `{{name}}`.** i18n-js accepts both;
 *     allowing both is how a `{name}` eventually ships rendering literally.
 *  3. **One `count` per message.** A second quantity is formatted through its
 *     own key and passed in as an opaque string — `t('a.b', { count: n, points:
 *     t('c.d', { count: m }) })`. Two counts in one message leaves a translator
 *     unable to tell which noun agrees with which.
 */
export const fr = {
  auth,
  business,
  common,
  courier,
  customer,
  domain,
  format,
  onboarding,
  validation,
};
