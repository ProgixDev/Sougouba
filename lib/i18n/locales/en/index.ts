import type { Catalogue } from '../../types';
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
 * The English catalogue.
 *
 * Annotated `Catalogue` rather than inferred: that is what makes a key missing
 * here — or a key that exists only here — a compile error rather than a hole
 * discovered on a shopper's screen.
 *
 * This is `en`, not "en-CA with French loanwords". The French side keeps the
 * Québec register on purpose ("courriel", not "e-mail"); the English side uses
 * the plain English word. If a France-French market ever appears, `fr-FR`
 * overrides the handful of keys that differ — do not fork `fr-CA` before then.
 */
export const en: Catalogue = {
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
