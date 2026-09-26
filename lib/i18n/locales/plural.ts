/**
 * A message whose wording depends on a count.
 *
 * `zero` is optional *and should usually be omitted*. Grammar is the
 * pluralizer's job (see `lib/i18n/pluralization.ts`): French falls back from
 * `zero` to `one`, so "0 commande" comes out right without an entry, and
 * English falls back to `other`, so "0 orders" does too. Author `zero` only
 * when the copy at zero is a *different sentence* — "Aucun résultat", not
 * "0 résultat".
 *
 * One `count` per message. A second quantity is formatted through its own key
 * and interpolated as an opaque `%{…}` string — see the note in
 * `locales/fr/index.ts`.
 */
export interface Plural {
  zero?: string;
  one: string;
  other: string;
}

/**
 * Identity at runtime; it exists to pin the leaf's type.
 *
 * Without it a plural entry is inferred as a plain object literal and `Widen`
 * cannot tell it apart from a nested namespace — which would let a missing
 * `other` through and put the dotted path on screen instead of a sentence.
 */
export const plural = (message: Plural): Plural => message;
