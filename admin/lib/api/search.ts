import { apiGet } from './client';

export interface SearchResult {
  type: 'vendor' | 'courier' | 'order' | 'user';
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export const TYPE_LABELS: Record<SearchResult['type'], string> = {
  vendor: 'Commerces',
  courier: 'Livreurs',
  order: 'Commandes',
  user: 'Utilisateurs',
};

/**
 * Route for each result type.
 *
 * Built here rather than returned by the API: these are this app's URLs, and
 * the API has no business knowing that a vendor lives at `/merchants/:id`.
 */
const HREF: Record<SearchResult['type'], (id: string) => string> = {
  vendor: (id) => `/merchants/${id}`,
  courier: (id) => `/couriers/${id}`,
  order: (id) => `/orders/${id}`,
  user: (id) => `/users/${id}`,
};

/**
 * Cross-entity search.
 *
 * ⚠️ Callers must debounce. `GlobalSearch` fires on every keystroke and the
 * `/admin` budget is 120 requests per minute per account — a fast typist would
 * exhaust it in a sentence. The right fix is a delay on the caller, not a
 * bigger budget.
 *
 * Under two characters this returns `[]` without a request; the API rejects
 * such a query anyway, and there is no reason to spend a round trip finding
 * that out.
 */
export async function searchAll(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const hits = await apiGet<Omit<SearchResult, 'href'>[]>('/admin/search', { q });
  return hits.map((hit) => ({ ...hit, href: HREF[hit.type](hit.id) }));
}
