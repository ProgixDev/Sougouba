import { getSeed } from './seed';
import { delay } from './storage';

export interface SearchResult {
  type: 'vendor' | 'courier' | 'order' | 'user';
  id: string;
  label: string;
  sublabel: string;
  href: string;
}

export const TYPE_LABELS: Record<SearchResult['type'], string> = {
  vendor: 'Commerçant',
  courier: 'Livreur',
  order: 'Commande',
  user: 'Utilisateur',
};

/** Global search across the platform's core entities, for the topbar search box. */
export async function searchAll(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  await delay(80, 160);

  const { vendors, couriers, orders, users } = getSeed();
  const results: SearchResult[] = [];

  for (const v of vendors) {
    if (v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q)) {
      results.push({ type: 'vendor', id: v.id, label: v.name, sublabel: v.city, href: `/merchants/${v.id}` });
    }
    if (results.filter((r) => r.type === 'vendor').length >= 5) break;
  }

  for (const c of couriers) {
    if (c.fullName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)) {
      results.push({ type: 'courier', id: c.id, label: c.fullName, sublabel: c.city, href: `/couriers/${c.id}` });
    }
    if (results.filter((r) => r.type === 'courier').length >= 5) break;
  }

  for (const o of orders) {
    if (o.id.toLowerCase().includes(q) || (o.customerName ?? '').toLowerCase().includes(q)) {
      results.push({ type: 'order', id: o.id, label: `#${o.id}`, sublabel: o.customerName ?? '—', href: `/orders/${o.id}` });
    }
    if (results.filter((r) => r.type === 'order').length >= 5) break;
  }

  for (const u of users) {
    if (u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
      results.push({ type: 'user', id: u.id, label: u.fullName, sublabel: u.email, href: `/users/${u.id}` });
    }
    if (results.filter((r) => r.type === 'user').length >= 5) break;
  }

  return results;
}
