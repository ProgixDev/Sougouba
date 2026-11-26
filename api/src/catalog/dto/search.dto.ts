import { z } from 'zod';

/**
 * `GET /search/suggestions?q=` — what the search panel asks as the shopper
 * types.
 *
 * Two letters at least: one letter is in half the catalogue and suggests
 * nothing, and the panel does not ask before two. Sixty at most — nobody types
 * a longer search, and the term is compared against every product name.
 *
 * No limit parameters on purpose. How many rows the panel shows is a property
 * of the panel, decided here once, not something a caller should be able to
 * raise to walk the catalogue through an endpoint built for eight rows.
 */
export const searchSuggestSchema = z.object({
  q: z.string().trim().min(2, 'Tapez au moins 2 lettres').max(60, 'Recherche trop longue'),
});

export type SearchSuggestQuery = z.infer<typeof searchSuggestSchema>;
