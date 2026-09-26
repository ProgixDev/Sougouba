import { api } from '../http';
import type { Category, ID } from '../types';

/**
 * The platform taxonomy — eight rows, read on nearly every screen.
 *
 * `anonymous: true` on both: the catalogue is public, and skipping the session
 * lookup means the home screen's first paint does not wait on AsyncStorage.
 */
export async function getCategories(): Promise<Category[]> {
  return api<Category[]>('/categories', { anonymous: true });
}

/**
 * ⚠️ Fetches the whole list and filters, because the API has no
 * `/categories/:id` — deliberately, since the list is eight rows and
 * unpaginated. Cheaper than the route it would take to avoid.
 */
export async function getCategoryById(id: ID): Promise<Category | undefined> {
  const categories = await getCategories();
  return categories.find((c) => c.id === id);
}
