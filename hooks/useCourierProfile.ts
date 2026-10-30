import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { couriersApi } from '@/data/api';
import type { Courier } from '@/data/types';
import { useSessionStore } from '@/store/useSessionStore';

export interface CourierProfileState {
  courier: Courier | null;
  loading: boolean;
  /** No file at all — this account has picked the role but never filled the form. */
  missing: boolean;
  /** A file exists but nobody has cleared it yet. */
  pending: boolean;
  /** Cleared to take runs. The only state the missions screen is usable in. */
  approved: boolean;
  reload: () => Promise<void>;
}

/**
 * Resolves the courier file behind the signed-in account.
 *
 * Sibling of `useOwnerVendor`, with one more state than it needs. A merchant is
 * either linked to a shop or not; a courier has three positions — no file, a
 * file waiting on a human, and a file cleared to work — and the difference
 * between the first two matters to whoever is looking at the screen. One says
 * "fill this in", the other says "we have it, wait".
 *
 * Reads `courierId` from the session but re-fetches the file, because `status`
 * lives on the file and can change without the session knowing.
 */
export function useCourierProfile(): CourierProfileState {
  const userId = useSessionStore((s) => s.user?.id);
  const courierId = useSessionStore((s) => s.user?.courierId);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setCourier(null);
      return;
    }
    // By id when the session knows one, by account otherwise: an application
    // submitted in this session has a file before the approval writes the link.
    const found = courierId
      ? await couriersApi.getCourierById(courierId)
      : await couriersApi.getCourierByUserId(userId);
    setCourier(found ?? null);
  }, [userId, courierId]);

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

  // Each courier tab holds its own copy of the file. Without this, approving
  // from the Missions tab left an already-visited Profile tab on the gate.
  // Quiet re-read — no `loading`, so an open screen does not blank out.
  // The first focus is the mount, which the effect above already covers.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload])
  );

  return {
    courier,
    loading,
    missing: !loading && !courier,
    pending: !loading && courier?.status === 'pending',
    approved: !loading && courier?.status === 'approved',
    reload,
  };
}
