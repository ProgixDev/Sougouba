import { InternalServerErrorException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { searchSuggestSchema } from './dto/search.dto.js';
import {
  SUGGESTION_CACHE_SIZE,
  SUGGESTION_TTL_MS,
  SearchSuggestionsService,
  suggestionCacheKey,
} from './search-suggestions.service.js';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

function fakeDb(...results: RpcResult[]) {
  let call = 0;
  // The last result repeats, so a spec only lists what differs.
  const rpc = vi.fn(() => Promise.resolve(results[Math.min(call++, results.length - 1)]));
  return { db: { rpc } as unknown as Db, rpc };
}

const RICE = { vendors: [], terms: ['riz'] };

afterEach(() => {
  vi.useRealTimers();
});

describe('search suggestions', () => {
  it('returns the shops and terms in the order the function ranked them', async () => {
    const vendors = [
      { id: 'v2', name: 'Riz & Co', specialtyFr: 'Épicerie fine', vendorType: 'grocery' },
      { id: 'v1', name: 'Le Riad', specialtyFr: 'Cuisine marocaine', vendorType: 'restaurant' },
    ];
    const { db, rpc } = fakeDb({ data: { vendors, terms: ['riz', 'Riz basmati 5 kg'] }, error: null });

    await expect(new SearchSuggestionsService(db).suggest('ri')).resolves.toEqual({
      vendors,
      terms: ['riz', 'Riz basmati 5 kg'],
    });
    // The panel's size is decided here, not by whoever calls the route.
    expect(rpc).toHaveBeenCalledWith('search_suggest', { p_q: 'ri', p_vendor_limit: 3, p_term_limit: 5 });
  });

  it('answers nothing while the function does not exist yet, so the panel still opens', async () => {
    for (const code of ['PGRST202', '42883']) {
      const { db } = fakeDb({ data: null, error: { code, message: 'missing' } });
      await expect(new SearchSuggestionsService(db).suggest('riz')).resolves.toEqual({ vendors: [], terms: [] });
    }
  });

  it('still fails on any other database error', async () => {
    const { db } = fakeDb({ data: null, error: { code: '57014', message: 'timeout' } });
    await expect(new SearchSuggestionsService(db).suggest('riz')).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('never hands the app a missing list', async () => {
    const { db } = fakeDb({ data: null, error: null });
    await expect(new SearchSuggestionsService(db).suggest('riz')).resolves.toEqual({ vendors: [], terms: [] });
  });

  it('asks for two letters at least and sixty at most, spaces not counted', () => {
    expect(searchSuggestSchema.parse({ q: '  ri ' }).q).toBe('ri');
    expect(searchSuggestSchema.safeParse({ q: 'r' }).success).toBe(false);
    expect(searchSuggestSchema.safeParse({ q: ' r ' }).success).toBe(false);
    expect(searchSuggestSchema.safeParse({}).success).toBe(false);
    expect(searchSuggestSchema.safeParse({ q: 'a'.repeat(60) }).success).toBe(true);
    expect(searchSuggestSchema.safeParse({ q: 'a'.repeat(61) }).success).toBe(false);
  });
});

describe('search suggestions — one database call serves everyone typing the same letters', () => {
  it('answers a repeated search from memory', async () => {
    const { db, rpc } = fakeDb({ data: RICE, error: null });
    const service = new SearchSuggestionsService(db);

    await service.suggest('riz');
    await expect(service.suggest('riz')).resolves.toEqual(RICE);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('treats the same letters with other accents, capitals or spacing as the same search', async () => {
    const { db, rpc } = fakeDb({ data: RICE, error: null });
    const service = new SearchSuggestionsService(db);

    for (const q of ['épi', 'Epi', 'ÉPI', 'épi']) await service.suggest(q);
    await service.suggest("côte-d'ivoire");
    await service.suggest('Cote  d’Ivoire');
    expect(rpc).toHaveBeenCalledTimes(2);

    expect(suggestionCacheKey('  Côte-d’Ivoire ')).toBe('cote d ivoire');
    // Different searches stay different.
    expect(suggestionCacheKey('riz')).not.toBe(suggestionCacheKey('ris'));
    expect(suggestionCacheKey('100%')).not.toBe(suggestionCacheKey('100'));
  });

  it('starts one call for shoppers who ask at the same instant', async () => {
    let answer: (value: RpcResult) => void = () => undefined;
    const rpc = vi.fn(() => new Promise<RpcResult>((resolve) => (answer = resolve)));
    const service = new SearchSuggestionsService({ rpc } as unknown as Db);

    const all = Promise.all([service.suggest('riz'), service.suggest('riz'), service.suggest('Riz')]);
    answer({ data: RICE, error: null });

    await expect(all).resolves.toEqual([RICE, RICE, RICE]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('asks again once the answer is a minute old', async () => {
    vi.useFakeTimers();
    const { db, rpc } = fakeDb({ data: RICE, error: null }, { data: { vendors: [], terms: ['riz', 'riz brisé'] }, error: null });
    const service = new SearchSuggestionsService(db);

    await service.suggest('riz');
    vi.advanceTimersByTime(SUGGESTION_TTL_MS - 1);
    await service.suggest('riz');
    expect(rpc).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await expect(service.suggest('riz')).resolves.toEqual({ vendors: [], terms: ['riz', 'riz brisé'] });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure: the next shopper gets a fresh try', async () => {
    const { db, rpc } = fakeDb({ data: null, error: { code: '57014', message: 'timeout' } }, { data: RICE, error: null });
    const service = new SearchSuggestionsService(db);

    await expect(service.suggest('riz')).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(service.suggest('riz')).resolves.toEqual(RICE);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not keep the empty answer given while the function is missing', async () => {
    const { db, rpc } = fakeDb({ data: null, error: { code: 'PGRST202', message: 'missing' } }, { data: RICE, error: null });
    const service = new SearchSuggestionsService(db);

    await expect(service.suggest('riz')).resolves.toEqual({ vendors: [], terms: [] });
    // The migration has just been applied: no minute of empty panels.
    await expect(service.suggest('riz')).resolves.toEqual(RICE);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('keeps a real empty answer — nothing matching is a result like any other', async () => {
    const { db, rpc } = fakeDb({ data: { vendors: [], terms: [] }, error: null });
    const service = new SearchSuggestionsService(db);

    await service.suggest('zzzz');
    await service.suggest('zzzz');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('holds a bounded number of answers, dropping the oldest', async () => {
    const { db, rpc } = fakeDb({ data: RICE, error: null });
    const service = new SearchSuggestionsService(db);

    for (let i = 0; i <= SUGGESTION_CACHE_SIZE; i++) await service.suggest(`terme ${i}`);
    expect(rpc).toHaveBeenCalledTimes(SUGGESTION_CACHE_SIZE + 1);

    // The newest is still held; the very first was dropped to make room.
    await service.suggest(`terme ${SUGGESTION_CACHE_SIZE}`);
    expect(rpc).toHaveBeenCalledTimes(SUGGESTION_CACHE_SIZE + 1);
    await service.suggest('terme 0');
    expect(rpc).toHaveBeenCalledTimes(SUGGESTION_CACHE_SIZE + 2);
  });
});
