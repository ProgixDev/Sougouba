import type { Plural } from './locales/plural';
import type { fr } from './locales/fr';

/**
 * The French catalogue with every string leaf widened from its literal type.
 *
 * `en/index.ts` is annotated `const en: Catalogue`, which buys both directions
 * of parity in one line: a key missing from English is a missing-property
 * error, and a key that exists *only* in English is an excess-property error,
 * because TypeScript applies excess checks to nested fresh object literals.
 * Neither survives `npm run typecheck`.
 *
 * `Plural` is matched before `string` so a plural leaf stays a plural leaf —
 * otherwise English could satisfy the type with a bare sentence where French
 * has forms, and the count would silently stop agreeing.
 */
export type Catalogue = Widen<typeof fr>;

/**
 * The same tree with string literals widened to `string`.
 *
 * Each English namespace annotates itself with `Widen<typeof frNamespace>` —
 * `locales/en/common.ts` and friends — rather than relying on the `Catalogue`
 * annotation in `en/index.ts` alone. That is not belt-and-braces: excess
 * property checking only applies to a *fresh object literal*, so annotating the
 * assembled `en` object catches a **missing** key but silently accepts an
 * **extra** one, because by then each namespace is an imported variable.

 * Annotating at the definition site, where the literal is still fresh, catches
 * both.
 */
export type Widen<T> = T extends Plural
  ? Plural
  : T extends string
    ? string
    : { [K in keyof T]: Widen<T[K]> };

type Join<K extends string, P extends string> = P extends '' ? K : `${K}.${P}`;

/**
 * Every dotted path to a renderable leaf — a string or a `Plural`.
 *
 * Kept to three levels by convention (`namespace.file.element`) because this is
 * a recursive mapped type: at depth 3 it resolves to a union `tsc` handles
 * without noticing, and depth is the one thing that makes it expensive.
 */
export type MessageKey<T = Catalogue> = T extends Plural
  ? never
  : {
      [K in keyof T & string]: T[K] extends string | Plural ? K : Join<K, MessageKey<T[K]>>;
    }[keyof T & string];

/**
 * Interpolation values. Deliberately *not* typed per-key.
 *
 * Deriving each message's placeholder names is expressible, but it forces `as
 * const` across every leaf — the single largest lever on `tsc --noEmit` time,
 * and `typecheck` is the first link in `npm run verify` — and it makes catalogue
 * whitespace load-bearing, since `%{ total}` would infer a parameter literally
 * named `" total"`. The mismatch it guards against (French interpolates
 * `%{total}`, English forgot it) is caught by `scripts/verify-i18n.ts`, which
 * reports it in a sentence instead of a type error.
 */
export type TranslateParams = Record<string, string | number>;

export interface TFunction {
  (key: MessageKey, params?: TranslateParams): string;
  /** Renders a message `lib/` chose but could not resolve — see `Message`. */
  (message: Message): string;
}

/**
 * A message chosen away from where it is rendered.
 *
 * `lib/` decides *which* string applies — a shop is closed, an order can
 * advance — but must not resolve it, because a module-scope resolution freezes
 * the launch locale and because `scripts/verify-logic.ts` imports these modules
 * under bare `tsx` where no translator exists. So `lib/` returns one of these
 * and the screen renders it.
 */
export interface Message {
  key: MessageKey;
  params?: TranslateParams;
}
