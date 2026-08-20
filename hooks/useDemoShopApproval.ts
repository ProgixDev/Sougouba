import { useCallback, useState } from 'react';

import { authApi, vendorsApi } from '@/data/api';
import { hashString } from '@/data/utils/random';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Stands in for the administrator who would clear a shop.
 *
 * Approval happens in the administration back-office, which is a later sprint —
 * so without this, a merchant account created in the app can never trade, and
 * the entire merchant experience is unreachable for exactly the account a demo
 * creates in front of someone.
 *
 * Two different actions, because there are two different things a demo needs:
 *
 * - `approve` clears the shop this account actually filed. Honest, and the one
 *   that matches what an administrator does — but a newly filed shop has no
 *   catalogue and no orders, so the dashboard and the analytics are empty by
 *   definition.
 * - `adoptDemoShop` borrows one of the seeded shops, catalogue and 45 days of
 *   history included, so those screens can be shown without filling a form
 *   first. Chosen by hashing the account id rather than at random, so the same
 *   account reopens the same shop on every launch.
 *
 * An earlier version ran approval automatically on mount, which had the opposite
 * problem: the pending state the CDC actually specifies was never seen, because
 * every account skipped straight past it.
 */
export function useDemoShopApproval(onApproved?: () => Promise<void> | void) {
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);
  const [approving, setApproving] = useState(false);
  const [adopting, setAdopting] = useState(false);

  const link = useCallback(
    async (vendorId: string) => {
      if (!user) return;
      // Session first so the tabs leave the pending state immediately; the mock
      // table write is what makes the link outlive this session.
      updateUser({ vendorId });
      try {
        await authApi.mockAttachVendor(user.id, vendorId);
      } catch {
        // The session already has the link — a failed write just means it is
        // re-derived from the shop's `ownerId` on the next launch.
      }
      await onApproved?.();
    },
    [user, updateUser, onApproved]
  );

  const approve = useCallback(async () => {
    if (!user || approving) return;
    setApproving(true);
    try {
      const shop = user.vendorId
        ? await vendorsApi.getVendorById(user.vendorId)
        : await vendorsApi.getVendorByOwnerId(user.id);
      if (!shop) return;
      await vendorsApi.setVendorStatus(shop.id, 'approved');
      await link(shop.id);
    } finally {
      setApproving(false);
    }
  }, [user, approving, link]);

  const adoptDemoShop = useCallback(async () => {
    if (!user || adopting) return;
    setAdopting(true);
    try {
      const vendors = await vendorsApi.getVendors();
      if (vendors.length === 0) return;
      await link(vendors[hashString(user.id) % vendors.length].id);
    } finally {
      setAdopting(false);
    }
  }, [user, adopting, link]);

  return { approve, approving, adoptDemoShop, adopting };
}
