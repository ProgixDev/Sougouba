import { useCallback, useEffect, useState } from 'react';

import { vendorsApi } from '@/data/api';
import type { Vendor } from '@/data/types';
import { useSessionStore } from '@/store/useSessionStore';

export interface OwnerVendorState {
  vendor: Vendor | null;
  loading: boolean;
  /** True once loading has finished and no shop is linked to this account. */
  missing: boolean;
  reload: () => Promise<void>;
}

/**
 * Resolves the shop belonging to the signed-in business owner.
 *
 * Every business screen needs this, and an owner *without* a linked shop is a
 * real state — anyone who signs up in-app and picks "commerçant" has no
 * `vendorId`, since the prototype has no shop-onboarding flow. Screens branch on
 * `missing` rather than rendering an empty dashboard that looks broken.
 */
export function useOwnerVendor(): OwnerVendorState {
  const vendorId = useSessionStore((s) => s.user?.vendorId);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!vendorId) {
      setVendor(null);
      setLoading(false);
      return;
    }
    const found = await vendorsApi.getVendorById(vendorId);
    setVendor(found ?? null);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [reload]);

  return { vendor, loading, missing: !loading && !vendor, reload };
}
