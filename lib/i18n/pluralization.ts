import type { I18n } from 'i18n-js';

/**
 * French counts zero as singular; English does not.
 *
 * "0 produit" is correct French and "0 products" is correct English, so the two
 * languages need different form lookups for the same catalogue shape. i18n-js's
 * default resolves `0 → ['zero','other']`, which is right for English and wrong
 * for French — it would render "0 produits".
 *
 * The *chain* matters as much as the head. A French message that authors a
 * `zero` form ("Aucune commande aujourd'hui") gets it; one that does not falls
 * through to `one` and reads "0 commande" — correct French, with no entry
 * written. That is why `Plural.zero` is optional and why authoring it is
 * reserved for copy that genuinely changes at zero rather than for grammar.
 *
 * Note this is i18n-js's own pluralizer registry, not `Intl.PluralRules` —
 * which is absent from Hermes' Android `Intl` and must never be reached for.
 */
export function registerPluralizers(i18n: I18n): void {
  i18n.pluralization.register('fr', (_i18n, count) => {
    if (count === 0) return ['zero', 'one', 'other'];
    if (count === 1) return ['one', 'other'];
    return ['other'];
  });
  // 'en' keeps the i18n-js default: 0 → `zero` if authored, else `other`.
}
