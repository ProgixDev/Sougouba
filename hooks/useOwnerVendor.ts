import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { vendorsApi } from '@/data/api';
import type { Vendor } from '@/data/types';
import { useSessionStore } from '@/store/useSessionStore';

export interface OwnerVendorState {
  vendor: Vendor | null;
  loading: boolean;
  /** No shop at all — this account picked the role but never filed anything. */
  missing: boolean;
  /** A shop exists but nobody has cleared it yet. */
  pending: boolean;
  /** Live on the platform. The only state the business screens are usable in. */
  approved: boolean;
  reload: () => Promise<void>;
}

/**
 * Resolves the shop belonging to the signed-in merchant.
 *
 * Three states, not two. It used to answer "linked or not", which was enough
 * while registration happened somewhere else — a shop either arrived attached
 * to the account or never existed. Now that a merchant fills the form in the
 * app, "no shop" and "a shop waiting on an administrator" are different things,
 * and the difference is exactly what the screen has to say: one asks for a form,
 * the other asks for patience.
 *
 * Sibling of `useCourierProfile`, which needs the same three positions for the
 * same reason.
 *
 * Looked up by owner rather than by a session field: `status` lives on the shop
 * and can change without the session knowing, and a shop filed in this session
 * exists before any approval writes `vendorId` back to the account.
 */
export function useOwnerVendor(): OwnerVendorState {
  const userId = useSessionStore((s) => s.user?.id);
  const vendorId = useSessionStore((s) => s.user?.vendorId);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setVendor(null);
      return;
    }
    const found = vendorId
      ? await vendorsApi.getVendorById(vendorId)
      : await vendorsApi.getVendorByOwnerId(userId);
    setVendor(found ?? null);
  }, [userId, vendorId]);

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

  // Each business tab holds its own copy of the shop. Without this, approving
  // or adopting a shop from one tab left the tabs already visited on the
  // "pending" screen. Quiet re-read — no `loading`, so an open screen does not
  // blank out. The first focus is the mount, which the effect above covers.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void reload();
      focusedOnce.current = true;
    }, [reload])
  );

  return {
    vendor,
    loading,
    missing: !loading && !vendor,
    pending: !loading && vendor?.status === 'pending',
    approved: !loading && vendor?.status === 'approved',
    reload,
  };
}
