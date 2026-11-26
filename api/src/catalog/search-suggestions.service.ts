import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';

/** A shop the letters typed so far could mean — enough to draw one row and open its page. */
export interface VendorSuggestion {
  id: string;
  name: string;
  specialtyFr: string;
  vendorType: 'grocery' | 'restaurant';
}

export interface SearchSuggestions {
  vendors: VendorSuggestion[];
  /** Product names and tags to search for, best guess first, spelled as the catalogue spells them. */
  terms: string[];
}

/** PostgREST's "no such function" and Postgres's own — `0057` not applied yet. */
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

/** What is answered while `search_suggest` does not exist. One object, so it can be told apart from a real empty answer. */
const NOT_INSTALLED: SearchSuggestions = Object.freeze({ vendors: [], terms: [] }) as SearchSuggestions;

/**
 * The panel is short on purpose: it sits between a keyboard and a search
 * field, and a suggestion list that scrolls has stopped being a shortcut.
 */
const VENDOR_LIMIT = 3;
const TERM_LIMIT = 5;

/**
 * How long an answer is reused, and how many are kept.
 *
 * Everyone typing « ri » gets the same answer, and « ri » is what everyone
 * types on the way to « riz » — so the commonest requests are also the most
 * repeated, and one database call can serve all of them for a minute. The
 * price is that a product hidden or a shop suspended a moment ago can be
 * suggested for up to that minute; tapping it then shows a catalogue that no
 * longer has it, which the search itself answers correctly.
 *
 * In this process's memory, like the rate limiter: two API instances keep two
 * caches, which costs a few duplicate calls and nothing else.
 */
export const SUGGESTION_TTL_MS = 60_000;
export const SUGGESTION_CACHE_SIZE = 2_000;

/**
 * Two searches that are certain to get the same answer share one cache entry:
 * « Épi », « epi » and « EPI  » fold alike in the database, so they do here.
 *
 * Deliberately no cleverer than `private.search_fold`. A key that folds less
 * (« cœur » and « coeur » stay apart here) only misses a share; one that
 * folded *more* would serve one search the answer to another.
 */
export function suggestionCacheKey(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class SearchSuggestionsService {
  private readonly logger = new Logger(SearchSuggestionsService.name);
  private warnedMissing = false;

  /** Insertion order is expiry order — every entry lives the same time — so the first key is always the oldest. */
  private readonly cache = new Map<string, { expiresAt: number; value: Promise<SearchSuggestions> }>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Shops and search terms for a few typed letters, from `search_suggest`
   * (`drizzle/0057_search_suggestions.sql`), which does the matching, the
   * accent folding and the ranking — nothing is re-sorted here.
   *
   * Categories are not part of the answer: the app holds all eight in both
   * languages and matches them itself.
   *
   * The *promise* is what is cached, not the answer: ten shoppers typing the
   * same letters in the same instant wait on one database call rather than
   * starting ten.
   */
  suggest(q: string): Promise<SearchSuggestions> {
    const key = suggestionCacheKey(q);
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = this.ask(q);
    this.remember(key, value, now);
    return value;
  }

  private remember(key: string, value: Promise<SearchSuggestions>, now: number): void {
    // Re-inserted, not overwritten in place: a refreshed entry must move to
    // the back of the line, or it would be evicted as if it were still old.
    this.cache.delete(key);
    this.cache.set(key, { expiresAt: now + SUGGESTION_TTL_MS, value });
    while (this.cache.size > SUGGESTION_CACHE_SIZE) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }

    // Two answers must not be served for a minute: a failure, and the empty
    // list given while the function is missing — the second would hide the
    // migration having just been applied.
    const forget = () => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    };
    value.then((result) => {
      if (result === NOT_INSTALLED) forget();
    }, forget);
  }

  /**
   * One call to the database.
   *
   * Answers nothing, rather than failing, while the function does not exist
   * (migration `0057` not applied): the panel then shows the shopper's recent
   * searches and the plain "search for …" row, and search itself is untouched.
   * Any other error still throws.
   */
  private async ask(q: string): Promise<SearchSuggestions> {
    const { data, error } = await this.db.rpc('search_suggest', {
      p_q: q,
      p_vendor_limit: VENDOR_LIMIT,
      p_term_limit: TERM_LIMIT,
    });
    if (error) {
      if (MISSING_FUNCTION.has(error.code)) {
        if (!this.warnedMissing) {
          this.warnedMissing = true;
          this.logger.warn('search_suggest does not exist yet — apply drizzle/0057_search_suggestions.sql');
        }
        return NOT_INSTALLED;
      }
      return unwrap<SearchSuggestions>(Promise.resolve({ data: null, error }));
    }

    // `Json` as far as the generated types know; the shape is the function's own.
    const result = (data ?? {}) as Partial<SearchSuggestions>;
    return { vendors: result.vendors ?? [], terms: result.terms ?? [] };
  }
}
