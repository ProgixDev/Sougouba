/**
 * Catalogue integrity, and the conventions that keep it honest.
 *
 * `tsc` already proves FR/EN key parity: each English namespace is annotated
 * `Widen<typeof frNamespace>` at its own definition site, which makes a missing
 * key a missing-property error and an extra key an excess-property error.
 * (Annotating only the assembled `en` object would catch the first and silently
 * accept the second, because excess checks apply to fresh literals, not to
 * imported variables.)
 *
 * Everything here is what a type cannot see: an English string that is still
 * French, a `%{total}` only one language interpolates, a line break a translator
 * quietly dropped, a screen still holding a hardcoded sentence.
 *
 * This runs under bare `tsx` with no React Native resolver, which is why
 * `lib/i18n/locales/**` may not import anything at runtime.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { en } from '../lib/i18n/locales/en';
import { fr } from '../lib/i18n/locales/fr';
import type { Plural } from '../lib/i18n/locales/plural';

const ROOT = resolve(__dirname, '..');

let failures = 0;
let warnings = 0;

function check(name: string, pass: boolean, detail = ''): void {
  if (!pass) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function warn(name: string, pass: boolean, detail = ''): void {
  if (!pass) {
    warnings++;
    console.log(`  warn  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

type Leaf = string | Plural;

const PLURAL_FORMS = new Set(['zero', 'one', 'other']);

/**
 * Whether a node is a plural leaf rather than a namespace.
 *
 * Checking for an `other` property alone is not enough, and getting this wrong
 * is not theoretical: `domain.disputeReason` has a member literally named
 * `other` ("Autre"), so a looser test read that whole namespace as one plural
 * message and reported every reason list as malformed. A plural is a node whose
 * keys are *only* plural forms and whose values are all strings.
 */
function isPlural(value: unknown): value is Plural {
  if (typeof value !== 'object' || value === null) return false;
  const entries = Object.entries(value);
  if (!entries.every(([key, form]) => PLURAL_FORMS.has(key) && typeof form === 'string')) {
    return false;
  }
  return 'one' in value && 'other' in value;
}

/** Every dotted path to a renderable leaf. */
function flatten(node: object, prefix = '', out = new Map<string, Leaf>()): Map<string, Leaf> {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPlural(value)) out.set(path, value as Leaf);
    else if (value && typeof value === 'object') flatten(value, path, out);
  }
  return out;
}

/** Every string a leaf can render, so a plural's forms are checked individually. */
function forms(leaf: Leaf): string[] {
  return typeof leaf === 'string' ? [leaf] : Object.values(leaf).filter(Boolean);
}

const FR = flatten(fr);
const EN = flatten(en);

console.log(`\nCATALOGUE — ${FR.size} keys`);

// 1. Key parity. Redundant with `tsc`, but it names every offender at once with
//    a full dotted path, where the compiler points at an object literal.
for (const key of FR.keys()) check(`${key} exists in en`, EN.has(key));
for (const key of EN.keys()) check(`${key} exists in fr`, FR.has(key));

// 2. Empty values. `''` type-checks and renders as an invisible label.
for (const [locale, table] of [['fr', FR], ['en', EN]] as const) {
  for (const [key, leaf] of table) {
    for (const form of forms(leaf)) {
      check(`${locale}.${key} is not blank`, form.trim().length > 0);
    }
  }
}

// 3. Placeholder parity. This is what stands in for typed interpolation params —
//    see the note in `lib/i18n/types.ts` on why those are not worth their cost.
const PLACEHOLDER = /%\{(\w+)\}/g;
const namesIn = (leaf: Leaf): Set<string> =>
  new Set(forms(leaf).flatMap((form) => [...form.matchAll(PLACEHOLDER)].map((m) => m[1])));

for (const [key, frLeaf] of FR) {
  const enLeaf = EN.get(key);
  if (!enLeaf) continue;
  const a = namesIn(frLeaf);
  const b = namesIn(enLeaf);
  const missing = [...a].filter((name) => !b.has(name));
  const extra = [...b].filter((name) => !a.has(name));
  check(
    `${key} placeholders match`,
    missing.length === 0 && extra.length === 0,
    `fr {${[...a].join(', ')}} vs en {${[...b].join(', ')}}`
  );
}

// 4. One placeholder syntax. i18n-js accepts `{{x}}` too; allowing both is how a
//    `{x}` eventually ships rendering literally.
for (const [locale, table] of [['fr', FR], ['en', EN]] as const) {
  for (const [key, leaf] of table) {
    for (const form of forms(leaf)) {
      check(`${locale}.${key} uses %{} interpolation`, !form.includes('{{'), form);
    }
  }
}

// 5. Line-break parity. The onboarding titles carry hand-tuned `\n`; a translator
//    dropping one reflows the app's first screen and nothing else would notice.
for (const [key, frLeaf] of FR) {
  const enLeaf = EN.get(key);
  if (!enLeaf) continue;
  const count = (leaf: Leaf) => forms(leaf).reduce((n, f) => n + (f.split('\n').length - 1), 0);
  check(`${key} line breaks match`, count(frLeaf) === count(enLeaf), `fr ${count(frLeaf)}, en ${count(enLeaf)}`);
}

// 6. Plural completeness. `zero` stays optional on purpose — the French
//    pluralizer falls back to `one`, so "0 commande" is right without an entry.
for (const [locale, table] of [['fr', FR], ['en', EN]] as const) {
  for (const [key, leaf] of table) {
    if (!isPlural(leaf)) continue;
    check(`${locale}.${key} has one+other`, Boolean(leaf.one && leaf.other));
  }
}

// 7. French left in an English value. Near-zero false positives, and it is the
//    copy-paste-and-forget error that bulk translation makes.
const FRENCH_TEXT = /[àâäéèêëîïôöùûüçœ]|\b(le|la|les|des|une|votre|vos|pour|avec|vous|dans|sur)\b/i;

/**
 * Words that carry an accent in English too, so the check above must not see
 * them: place names, and the West African and Maghrebi loanwords that are the
 * product's whole vocabulary. "attiéké" is spelled "attiéké" in both languages —
 * that is exactly why product names were left untranslated.
 */
const LOANWORDS =
  /attiéké|thiéboudienne|thieboudienne|Montréal|Québec|café|crème|piña|à la carte|MAPAQ|Registraire des entreprises/gi;

for (const [key, leaf] of EN) {
  for (const form of forms(leaf)) {
    check(`en.${key} is English`, !FRENCH_TEXT.test(form.replace(LOANWORDS, '')), JSON.stringify(form));
  }
}

// 8. Untranslated. Warn only: plenty of strings are legitimately identical.
const SAME_IN_BOTH = new Set(['Sougouba', 'Interac', 'Visa', 'Mastercard', 'TPS', 'TVQ', 'PIN', 'km', 'm', '%', ', ']);
for (const [key, frLeaf] of FR) {
  const enLeaf = EN.get(key);
  if (!enLeaf || typeof frLeaf !== 'string' || typeof enLeaf !== 'string') continue;
  warn(
    `${key} may be untranslated`,
    frLeaf !== enLeaf || SAME_IN_BOTH.has(frLeaf) || !/[a-zA-Z]/.test(frLeaf),
    JSON.stringify(frLeaf)
  );
}

// ---------------------------------------------------------------------------
// Source-tree conventions
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !path.includes(join('lib', 'i18n', 'locales'))) out.push(path);
  }
  return out;
}

const SCREEN_FILES = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))].filter(
  (path) => !path.includes('_dev')
);

console.log(`\nSOURCE — ${SCREEN_FILES.length} files under app/ and components/`);

// 9. The formatter-subscription rule. `formatCad` reads the global locale, so a
//    component that formats money but subscribes to nothing keeps last
//    language's numbers after a switch. This is a real, silent, visible bug.
for (const path of SCREEN_FILES) {
  const source = readFileSync(path, 'utf8');
  const formats = /from '@\/lib\/(format|geo)'/.test(source);
  const subscribes = /\buseT\(\)|\buseLocale\(\)/.test(source);
  // Also a hard failure now that it is at zero. The bug it catches is silent:
  // the screen's labels switch language and its prices do not.
  check(
    `${relative(ROOT, path)} subscribes to the locale`,
    !formats || subscribes,
    'imports a locale-aware formatter but never calls useT()/useLocale()'
  );
}

// 10. Accessibility labels. Invisible, so no visual pass catches a French
//     VoiceOver label in an English build.
const A11Y_LITERAL = /accessibility(?:Label|Hint)=(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g;
for (const path of SCREEN_FILES) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(A11Y_LITERAL)) {
    // A hard failure, not a warning: this one reached zero, and it is the check
    // with no blind spot. A French VoiceOver label in an English build is
    // invisible to every visual pass, so the compiler-adjacent check is the only
    // thing standing between it and a shipped regression.
    check(`${relative(ROOT, path)} a11y label is translated`, false, match[0].slice(0, 70));
  }
}

// 11. Leftover hardcoded copy — a *direction* metric, not a completion test.
//
//     A character class beats a string search here: the codebase uses the curly
//     `’` 141 times but is not consistent about it, so an apostrophe grep would
//     both miss real strings and drown in false negatives. Accented letters and
//     guillemets catch far more.
//
//     But it cannot catch accent-free French — "Commandes", "Panier", "Favoris",
//     "Total" — which is a large minority of the ~810 strings in scope. So a
//     zero here means "no accented French left", not "extraction complete".
//     Checks 9 and 10 are the ones with no blind spot; those are what should
//     flip to `check()` when the sweep is done.
const FRENCH_CHARS = /[àâäéèêëîïôöùûüçœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇŒ«»]/;

/**
 * The other half of the signal, and the reason the count is trustworthy.
 *
 * An accent-only test has a large blind spot: "Commandes", "Recettes", "Panier
 * moyen", "7 jours" and "Analytique" are all French and carry no accent at all.
 * Running the accent test alone reported zero while dozens of those were still
 * inline. A French function word is the cheapest reliable tell for the rest.
 */
const FRENCH_WORDS =
  /\b(le|la|les|des|une|un|votre|vos|pour|avec|vous|dans|sur|et|du|aux|est|sont|ne|pas|par|cette|mes|nous|jours?|commandes?|boutique|clients?|livraison|panier|recettes|analytique|moyen|meilleur|aucune?)\b/i;
const ALLOWED_LITERALS = new Set(['Montréal', 'Montréal, QC', 'Français']);
let literals = 0;
for (const path of SCREEN_FILES) {
  const source = readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/className=(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g, '');
  // Deliberately line-bounded (`[^'"`\n]`). Letting a match cross a newline makes
  // the matcher pair a quote with one thousands of characters later, which both
  // invents hits that are really code and swallows the real strings inside them.
  for (const match of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){3,})\1/g)) {
    // A place name and a language's own name are not copy: "Montréal" is spelled
    // that way in English, and the language toggle names each option in its own
    // language so someone who cannot read the other one can still find theirs.
    if (ALLOWED_LITERALS.has(match[2])) continue;
    if (FRENCH_CHARS.test(match[2]) || FRENCH_WORDS.test(match[2])) {
      literals++;
      if (process.env.I18N_LIST) console.log(`       ${relative(ROOT, path)}: ${match[2].slice(0, 70)}`);
    }
  }
}
// At zero, so it holds the line. Both signals together — accented characters
// and French function words — have no blind spot large enough to trust a
// warning with.
check(`${literals} hardcoded French literals remain in app/ and components/`, literals === 0);

console.log(
  failures === 0 ? `\nI18N CHECKS PASS${warnings ? ` (${warnings} warning(s))` : ''}` : `\n${failures} PROBLEM(S)`
);
process.exit(failures === 0 ? 0 : 1);
