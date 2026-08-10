import { useEffect, useRef } from 'react';

import { authApi, vendorsApi } from '@/data/api';
import type { ID } from '@/data/types';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Give a merchant account without a shop one of the seeded shops to run.
 *
 * The prototype has no shop-onboarding flow, so anyone who signs up in the app
 * and picks "commerçant" lands with no `vendorId` — and every one of the five
 * business tabs renders its "no shop linked" fallback. The whole merchant
 * experience is unreachable for exactly the account a demo creates in front of
 * someone.
 *
 * The shop is chosen by hashing the account id rather than at random, so the
 * same account reopens the same shop on every launch, and two demo accounts
 * created in a row are unlikely to land on the same one. The link is written
 * through `authApi` as well as into the session, so it survives sign-out and
 * sign-in — not just a relaunch.
 *
 * `useOwnerVendor().missing` is still a real state and every screen still
 * handles it: this cannot run before the session exists, and a shop could be
 * removed from the seed.
 */
export function useBusinessDemoSeed() {
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);
  const attempted = useRef<ID | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'business' || user.vendorId) return;
    if (attempted.current === user.id) return;
    attempted.current = user.id;

    let cancelled = false;

    (async () => {
      const vendors = await vendorsApi.getVendors();
      if (cancelled || vendors.length === 0) return;

      const vendor = vendors[hashString(user.id) % vendors.length];
      // Session first so the tabs stop showing the empty state immediately; the
      // mock table write is what makes it outlive this session.
      updateUser({ vendorId: vendor.id });
      try {
        await authApi.mockAttachVendor(user.id, vendor.id);
      } catch {
        // The session already has the link — a failed write just means it is
        // re-derived on the next launch, which lands on the same shop anyway.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, updateUser]);
}

/** FNV-1a. Stable across launches, unlike a hash seeded from object identity. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
