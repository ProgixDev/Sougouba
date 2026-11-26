import { api, ApiError } from '../http';
import type { ID, VendorType } from '../types';

/** A shop the letters typed so far could mean — enough for one row that opens its page. */
export interface VendorSuggestion {
  id: ID;
  name: string;
  /** French only: the API has no English specialty. The screen prefers the cached shop's own, when it has it. */
  specialtyFr: string;
  vendorType: VendorType;
}

export interface SearchSuggestions {
  vendors: VendorSuggestion[];
  /** Product names and tags to search for, best guess first. */
  terms: string[];
}

const NOTHING: SearchSuggestions = { vendors: [], terms: [] };

/**
 * Shops and search terms for a few typed letters.
 *
 * A 404 answers "nothing" rather than failing: an API deployed before this
 * route existed should cost the panel its shop and term rows, not put an error
 * under the search field. Recent searches and categories never needed it.
 */
export async function getSuggestions(q: string): Promise<SearchSuggestions> {
  try {
    const result = await api<Partial<SearchSuggestions>>('/search/suggestions', { anonymous: true, query: { q } });
    return { vendors: result.vendors ?? [], terms: result.terms ?? [] };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return NOTHING;
    throw error;
  }
}
