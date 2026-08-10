import type { Address } from '../types';

/**
 * Fallback delivery address.
 *
 * Only the seeded demo customer has an address; anyone who signs up in-app has
 * an empty list, and checkout must not dead-end on that. Real address entry is
 * out of scope for the prototype, so checkout falls back to this and shows it as
 * an editable-looking row.
 */
export const defaultDeliveryAddress: Address = {
  id: 'addr_default',
  label: 'Domicile',
  street: '1420 Rue Sainte-Catherine Ouest, app. 302',
  city: 'Montréal',
  postalCode: 'H3G 1R8',
  lat: 45.4959,
  lng: -73.5773,
  isDefault: true,
};
