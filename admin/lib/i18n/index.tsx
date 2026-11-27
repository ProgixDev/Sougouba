import { useSyncExternalStore, type ReactNode } from 'react';
import { en } from './locales/en';
import { fr } from './locales/fr';
import type { Paths, Plural } from './types';

/**
 * The back office and the merchant portal, in French and in English.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 *
 * `t()` is a plain function, not a hook: it reads the language in force at the
 * moment it is called, so it can be used anywhere a string is needed — in a
 * component, in an event handler, in a helper that is not a component at all.
 *
 * Switching (`setLocale`) happens in place: no reload, no request, nothing the
 * reader typed is lost. Two things make that work, and both are needed:
 *
 * 1. **Components subscribe.** Every component calls `useLocale()` first
 *    thing, which re-renders it when the language changes; its `t()` calls
 *    then return the other language. A component that forgets keeps its old
 *    labels until something else re-renders it — `npm run i18n:check` reports
 *    those.
 * 2. **Tables of labels are `lazy`.** A constant built when a file loads —
 *    `const TABS = [{ label: t('…') }]` — would be frozen in the language of
 *    that moment. Wrapped as `lazy(() => […])` it is rebuilt, in place, on
 *    every switch, and the code that reads it does not change. A bare string
 *    cannot be rebuilt in place, so never keep `t()`'s result in a top-level
 *    `const`: call it where it is shown. The check reports those too.
 *
 * Nothing is rendered on the server in the reader's language, since the server
 * does not know it: `LanguageGate` in the root layout renders the app only in
 * the browser. Every page behind a sign-in already worked that way.
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

const toIntl = (value: Locale) => (value === 'fr' ? 'fr-CA' : 'en-CA');

/**
 * The language in force. A live binding: a module that imports it reads the
 * current value each time, not the one at load — but only code that runs
 * *after* a switch sees it, so read it inside functions, never to build a
 * top-level constant.
 */
export let locale: Locale = detect();

/** The same, as `Intl` wants it — Canadian conventions in both languages. */
export let intlLocale: string = toIntl(locale);

let dictionary: unknown = locale === 'fr' ? fr : en;
let pluralRules = new Intl.PluralRules(intlLocale);

/** Tables of labels to rebuild on a switch, in the order their files loaded — so one built from another follows it. */
const rebuilders: (() => void)[] = [];
const listeners = new Set<() => void>();

/**
 * A table of labels built when a file loads, kept in the reader's language.
 *
 *   const TABS = lazy(() => [{ key: 'open', label: t('disputes.tabs.open') }]);
 *
 * It returns the very array or object `make` built, and on every language
 * switch empties it and refills it from a fresh call — same object, new
 * contents — so everything that already holds it reads the new language.
 * For arrays and plain objects only; a string has nothing to refill.
 */
export function lazy<T extends object>(make: () => T): T {
  const value = make();
  rebuilders.push(() => {
    const fresh = make();
    if (Array.isArray(value)) {
      value.length = 0;
      value.push(...(fresh as unknown as unknown[]));
    } else {
      const target = value as Record<string, unknown>;
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, fresh);
    }
  });
  return value;
}

/**
 * Change language, here and now: every `lazy` table is rebuilt, every component
 * that called `useLocale()` renders again, and the choice is remembered for the
 * next visit. No reload and no request.
 */
export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  intlLocale = toIntl(next);
  dictionary = next === 'fr' ? fr : en;
  pluralRules = new Intl.PluralRules(intlLocale);

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Nowhere to keep it (private mode): it still applies until the page is closed.
  }
  document.documentElement.lang = intlLocale;

  for (const rebuild of rebuilders) rebuild();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => locale;

/**
 * The language in force — and, more to the point, a subscription to it: the
 * component that calls this renders again when the language changes. Called at
 * the top of every component, whether or not it uses the value.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export type MessageKey = Paths<typeof fr>;
export type MessageParams = Record<string, string | number>;

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
