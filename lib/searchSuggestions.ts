/**
 * The part of the search panel that needs no request.
 *
 * Shops and search terms come from the API (`search_suggest`). Categories do
 * not: there are eight, the app already holds them in both languages, and
 * matching them here means a shopper typing in English is offered « Spices »
 * although the database only stores « Épices ».
 *
 * The folding and the ranking mirror `api/drizzle/0057_search_suggestions.sql`
 * so the two halves of one panel agree on what « epi » matches.
 */

/** The panel asks nothing below this: one letter is in half the catalogue. */
export const MIN_SUGGEST_LENGTH = 2;

/** Letters in the middle of a word only count from here — « ri » is inside « épicerie ». */
const MIN_INFIX_LENGTH = 3;

/** How many past searches the phone keeps. */
export const MAX_RECENT_SEARCHES = 6;

/**
 * Lower case, no accents, one space between words — « Épices  du Sahel » and
 * « epices du sahel » are the same search.
 *
 * `œ` and `æ` are spelled out by hand: they are letters of their own to
 * Unicode, so `NFD` leaves them whole, and « coeur » would miss « cœur ».
 */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How well `text` answers the letters typed: 0 starts with them, 1 has a word
 * starting with them, 2 merely contains them (three letters at least), `null`
 * no match. Both arguments already folded.
 */
export function matchRank(folded: string, needle: string): 0 | 1 | 2 | null {
  if (needle.length < MIN_SUGGEST_LENGTH) return null;
  if (folded.startsWith(needle)) return 0;
  // A word starts after a space, a hyphen or an apostrophe.
  if (` ${folded.replace(/[-'’]/g, ' ')}`.includes(` ${needle}`)) return 1;
  if (needle.length >= MIN_INFIX_LENGTH && folded.includes(needle)) return 2;
  return null;
}

/**
 * The entries whose label matches what was typed, best match first.
 *
 * `labelsOf` returns every name an entry answers to (a category has a long and
 * a short one); the best of them ranks the entry. Ties keep the list's own
 * order, which for categories is the order the home screen shows them in.
 */
export function matchByLabel<T>(items: readonly T[], labelsOf: (item: T) => string[], query: string, limit: number): T[] {
  const needle = foldSearch(query);
  if (needle.length < MIN_SUGGEST_LENGTH) return [];
  return items
    .map((item, index) => {
      const ranks = labelsOf(item)
        .map((label) => matchRank(foldSearch(label), needle))
        .filter((rank): rank is 0 | 1 | 2 => rank !== null);
      return { item, index, rank: ranks.length > 0 ? Math.min(...ranks) : null };
    })
    .filter((entry): entry is { item: T; index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/**
 * A search added to the phone's recent list: newest first, no duplicates
 * (« Riz » after « riz » moves it up rather than listing it twice), capped.
 * Too short to have been a search is ignored.
 */
export function withRecentSearch(recent: readonly string[], term: string): string[] {
  const cleaned = term.replace(/\s+/g, ' ').trim();
  const folded = foldSearch(cleaned);
  if (folded.length < MIN_SUGGEST_LENGTH) return [...recent];
  return [cleaned, ...recent.filter((entry) => foldSearch(entry) !== folded)].slice(0, MAX_RECENT_SEARCHES);
}
