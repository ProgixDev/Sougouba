import { useState } from 'react';

import { couriersApi } from '@/data/api';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';

/**
 * The gate's "Simuler l'approbation" button: clears the signed-in courier's own
 * pending file, then re-reads it so the driver screens open.
 *
 * Test phase only. The API route exists only while `ALLOW_DEMO_SELF_APPROVAL`
 * is set on the deploy and is a 404 otherwise — said as such, rather than as a
 * generic failure, so a tester knows to ask an administrator instead of retrying.
 * The real decision is `POST /admin/couriers/:id/approve`, behind `AdminGuard`.
 */
export function useDemoCourierApproval(onApproved?: () => Promise<void> | void) {
  const t = useT();
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setError(null);
    setApproving(true);
    try {
      await couriersApi.demoApproveMine();
      await onApproved?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? t('courier.gate.approveDisabled')
          : t('courier.gate.approveFailed')
      );
    } finally {
      setApproving(false);
    }
  }

  return { approve, approving, error };
}
