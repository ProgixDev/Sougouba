import type { ReactNode } from 'react';
import { en } from './locales/en';
import { fr } from './locales/fr';
import type { Paths, Plural } from './types';

/**
 * The back office and the merchant portal, in French and in English.
 *
 * ── How it works, and why it is this simple ─────────────────────────────────
 *
 * The language is decided **once, when the page loads** — the saved choice, or
 * else the browser's own language — and never changes while the page is open.
 * Switching (`setLocale`) saves the choice and reloads.
 *
 * That is deliberate. Because the language is fixed for the life of the page,
 * `t()` is a plain function, not a hook: it can be called anywhere a string is
 * needed — in a component, in an event handler, in a label map at the top of a
 * file — and nothing has to subscribe to anything or re-render on a switch.
 * The alternative (a hook everywhere) breaks silently wherever a label is built
 * outside a component, and this code has many of those.
 *
 * The price is that nothing can be rendered on the server in the reader's
 * language, since the server does not know it. `LanguageGate` in the root
 * layout therefore renders the app only in the browser. Every page behind a
 * sign-in already worked that way.
 *
 * ── Adding text ─────────────────────────────────────────────────────────────
 *
 * Messages live in `locales/fr/<area>.ts` and `locales/en/<area>.ts`. French
 * is the reference: its keys are the `MessageKey` type, and the English file is
 * typed as "the same shape" (`Shape`), so a message missing from either
 * language does not compile.
 *
 *   t('orders.title')
 *   t('orders.count', { count: 3 })          // { one: '…', other: '…' }
 *   t('orders.refunded', { amount: '12 $' }) // 'Remboursé : {amount}'
 *   tx('payouts.lastRun', { date: <b>…</b> }) // the same, with elements in it
 */

export type Locale = 'fr' | 'en';

/** Where the reader's choice is kept. Also read by the inline script in `app/layout.tsx`. */
export const LOCALE_STORAGE_KEY = 'sougouba-admin-lang';

function detect(): Locale {
  // On the server (the build's prerender) nothing is shown — see `LanguageGate`.
  if (typeof window === 'undefined') return 'fr';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // Storage refused (private mode): fall through to the browser's language.
  }
  // French unless the browser says English: this is a Québec product first.
  return (window.navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
}

/** The language of this page load. */
export const locale: Locale = detect();

/** The same, as `Intl` wants it — Canadian conventions in both languages. */
export const intlLocale = locale === 'fr' ? 'fr-CA' : 'en-CA';

/** Save the choice and reload in it. */
export function setLocale(next: Locale): void {
  if (next === locale) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Nowhere to keep it: the reload would come back in the same language.
    return;
  }
  window.location.reload();
}

export type MessageKey = Paths<typeof fr>;
export type MessageParams = Record<string, string | number>;

const dictionary: unknown = locale === 'fr' ? fr : en;
const pluralRules = new Intl.PluralRules(intlLocale);

function lookup(key: string): string | Plural | undefined {
  let node: unknown = dictionary;
  for (const part of key.split('.')) {
    // Own properties only: `tMaybe` is given keys built from data, and a role
    // whose slug is `constructor` must not resolve to `Object`'s.
    if (typeof node !== 'object' || node === null || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null && 'one' in node && 'other' in node) return node as Plural;
  return undefined;
}

function template(key: string, params?: MessageParams): string | undefined {
  const found = lookup(key);
  if (found === undefined) return undefined;
  if (typeof found === 'string') return found;
  return pluralRules.select(Number(params?.count ?? 0)) === 'one' ? found.one : found.other;
}

const fill = (text: string, params?: MessageParams) =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

/** The message at `key`, in the reader's language, with `{name}` placeholders filled in. */
export function t(key: MessageKey, params?: MessageParams): string {
  // A key the compiler accepted always exists; the fallback is for `as` casts.
  return fill(template(key, params) ?? key, params);
}

/**
 * For a key built at run time from data — a permission code, a status the API
 * may add tomorrow. Returns `fallback` when there is no such message, so an
 * unknown value shows as it came rather than as a dotted key.
 */
export function tMaybe(key: string, fallback: string, params?: MessageParams): string {
  const found = template(key, params);
  return found === undefined ? fallback : fill(found, params);
}

/**
 * `t`, for a sentence with elements inside it: each `{name}` is replaced by the
 * node given under that name, so word order stays the translator's to decide.
 *
 *   tx('payouts.lastRun', { date: <strong>{formatDateTime(at)}</strong> })
 */
export function tx(key: MessageKey, nodes: Record<string, ReactNode>, params?: MessageParams): ReactNode[] {
  const text = template(key, params) ?? key;
  return text.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    if (name === undefined) return part;
    if (name in nodes) return <span key={index}>{nodes[name]}</span>;
    return params && name in params ? String(params[name]) : part;
  });
}

/**
 * The text in the reader's language out of a pair the API stores in both — a
 * category's `nameFr` / `nameEn`. Falls back to the other when one is empty.
 */
export function pick(frText: string | null | undefined, enText: string | null | undefined): string {
  return (locale === 'en' ? enText || frText : frText || enText) ?? '';
}
