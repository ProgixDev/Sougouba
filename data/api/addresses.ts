import { api } from '../http';
import type { Address, ID } from '../types';

/**
 * The shopper's address book, held by the API.
 *
 * The server geocodes on write and owns `isDefault` (the first address becomes
 * the default; setting another clears the old one in the same transaction), so
 * every write here is followed by a fresh `list()` rather than patched into the
 * local copy — two rules kept in one place instead of re-implemented beside it.
 *
 * This matters beyond sync: `POST /orders` takes an `addressId` and refuses
 * anything that is not a saved address's UUID. An address that only ever lived
 * on the phone could not be ordered to.
 */
export type AddressInput = Pick<Address, 'label' | 'street' | 'city' | 'postalCode'>;

export async function list(): Promise<Address[]> {
  return api<Address[]>('/me/addresses');
}

export async function create(input: AddressInput): Promise<Address> {
  return api<Address>('/me/addresses', { method: 'POST', body: input });
}

export async function update(id: ID, patch: Partial<AddressInput> & { isDefault?: boolean }): Promise<Address> {
  return api<Address>(`/me/addresses/${id}`, { method: 'PATCH', body: patch });
}

export async function remove(id: ID): Promise<void> {
  await api(`/me/addresses/${id}`, { method: 'DELETE' });
}
