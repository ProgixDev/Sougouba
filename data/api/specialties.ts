import { api } from '../http';
import type { ID, VendorType } from '../types';

/** One entry of the back-office list a shop picks its specialty from. */
export interface Specialty {
  id: ID;
  slug: string;
  vendorType: VendorType;
  nameFr: string;
  nameEn: string;
}

/**
 * The specialties a shop of this type may choose — cuisines for a restaurant,
 * kinds of shop for a grocery. Controlled by the back office; only active
 * entries come back, already in display order.
 *
 * `anonymous: true`: read on the registration form, where the list is public
 * and the shop does not exist yet.
 */
export async function getSpecialties(type: VendorType): Promise<Specialty[]> {
  return api<Specialty[]>('/specialties', { anonymous: true, query: { type } });
}
