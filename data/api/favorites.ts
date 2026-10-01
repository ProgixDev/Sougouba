import { api } from '../http';
import type { ID } from '../types';

/** The shopper's saved products and shops, held by the API so they follow the account to any phone. */
export async function setProduct(productId: ID, favorite: boolean): Promise<void> {
  await api(`/me/favorites/products/${productId}`, { method: favorite ? 'POST' : 'DELETE' });
}

export async function setVendor(vendorId: ID, favorite: boolean): Promise<void> {
  await api(`/me/favorites/vendors/${vendorId}`, { method: favorite ? 'POST' : 'DELETE' });
}
