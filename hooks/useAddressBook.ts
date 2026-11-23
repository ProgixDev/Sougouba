import { useState } from 'react';
import { Alert } from 'react-native';

import { addressesApi } from '@/data/api';
import { ApiError } from '@/data/http';
import type { Address } from '@/data/types';
import { useT } from '@/lib/i18n/useT';
import type { DeliveryDetails } from '@/data/api/addresses';
import type { AddressValues } from '@/lib/validation/profile';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * The shopper's address book, as the address screen and the home location
 * picker both edit it.
 *
 * Every change goes to the API, then the book is re-read from it. The server
 * geocodes and decides the default, and `POST /orders` only accepts the id of
 * an address it holds — so the server's list is the one worth showing.
 */
export function useAddressBook() {
  const t = useT();
  const addresses = useSessionStore((s) => s.user?.addresses) ?? [];
  const updateUser = useSessionStore((s) => s.updateUser);
  const [saving, setSaving] = useState(false);

  async function sync(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      updateUser({ addresses: await addressesApi.list() });
      return true;
    } catch (error) {
      Alert.alert(
        t('customer.account.addresses.saveFailed'),
        error instanceof ApiError && error.isClientError ? error.message : t('common.genericError')
      );
      return false;
    }
  }

  /**
   * `asDefault` for the home picker: an address added there is where the
   * shopper just said they are, so it becomes the one distances and checkout use.
   */
  async function save(
    values: AddressValues & DeliveryDetails,
    existing: Address | null,
    { asDefault = false }: { asDefault?: boolean } = {}
  ): Promise<boolean> {
    setSaving(true);
    const ok = await sync(async () => {
      const saved = existing
        ? await addressesApi.update(existing.id, values)
        : await addressesApi.create(values);
      if (asDefault && !saved.isDefault) await addressesApi.update(saved.id, { isDefault: true });
    });
    setSaving(false);
    return ok;
  }

  return {
    addresses,
    saving,
    sync,
    save,
    makeDefault: (address: Address) =>
      sync(() => addressesApi.update(address.id, { isDefault: true })),
    remove: (address: Address) => sync(() => addressesApi.remove(address.id)),
  };
}
