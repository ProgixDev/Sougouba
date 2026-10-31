import { useState } from 'react';

import { vendorsApi } from '@/data/api';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';

/**
 * The two demonstration buttons on the merchant's "pending" screen.
 *
 * - `approve` — puts the merchant's own pending shop online, as an
 *   administrator would.
 * - `adoptDemoShop` — attaches this account to a seeded shop that already has a
 *   catalogue and an order history, so the dashboard has something to show.
 *
 * Test phase only. Both API routes exist only while `ALLOW_DEMO_SELF_APPROVAL`
 * is set and answer 404 otherwise — said as such, so a tester knows to ask
 * rather than retry. The real approval is `POST /admin/vendors/:id/approve`.
 */
export function useDemoShopApproval(onApproved?: () => Promise<void> | void) {
  const t = useT();
  const [approving, setApproving] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, setBusy: (busy: boolean) => void) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await onApproved?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.status === 404
            ? t('business.pending.demoDisabled')
            : cause.message
          : t('common.genericError')
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    approve: () => run(vendorsApi.demoApproveMine, setApproving),
    approving,
    adoptDemoShop: () => run(vendorsApi.adoptDemoShop, setAdopting),
    adopting,
    error,
  };
}
