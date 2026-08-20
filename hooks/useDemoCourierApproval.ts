import { useCallback, useState } from 'react';

import { authApi, couriersApi } from '@/data/api';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Stands in for the administrator who would clear a courier's file.
 *
 * The courier twin of `useDemoShopApproval`, and it exists for the same reason:
 * approval lives in the administration back-office, which is a later sprint, so
 * without this the entire livreur experience is unreachable for exactly the
 * account a demo creates in front of someone.
 *
 * It approves the file this account actually submitted rather than handing out
 * a seeded one — a courier's file *is* their own details, so borrowing someone
 * else's would put a stranger's name on the profile screen. The button is
 * labelled for what it is.
 */
export function useDemoCourierApproval(onApproved?: () => void) {
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);
  const [approving, setApproving] = useState(false);

  const approve = useCallback(async () => {
    if (!user || approving) return;
    setApproving(true);
    try {
      const file = user.courierId
        ? await couriersApi.getCourierById(user.courierId)
        : await couriersApi.getCourierByUserId(user.id);
      if (!file) return;

      await couriersApi.setCourierStatus(file.id, 'approved');
      // Session first so the tabs leave the pending state immediately; the mock
      // table write is what makes the link outlive this session.
      updateUser({ courierId: file.id });
      try {
        await authApi.mockAttachCourier(user.id, file.id);
      } catch {
        // The session already has the link; a failed write only means it is
        // re-derived from the file on the next launch.
      }
      await onApproved?.();
    } finally {
      setApproving(false);
    }
  }, [user, updateUser, approving, onApproved]);

  return { approve, approving };
}
