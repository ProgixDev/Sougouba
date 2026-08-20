import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ID } from '@/data/types';
import type { DeliveryOffer } from '@/lib/dispatch';
import { asyncStorage } from './storage';

interface DispatchState {
  /** Whether the courier is taking runs. Nothing is offered while false. */
  online: boolean;
  /** The one offer on screen, if any. A courier is never shown two at once. */
  offer: DeliveryOffer | null;
  /** The run in progress. Its details live on the order, not here. */
  activeOrderId: ID | null;
  /**
   * Orders this courier has declined or let expire.
   *
   * Without it the engine re-offers the same order the instant the last offer
   * clears, which is not a cascade — it is the same card reappearing forever.
   * A real dispatcher passes to the next courier; here the effect is that the
   * order leaves *this* courier's queue and the seeded couriers take it.
   */
  passedOrderIds: ID[];
  goOnline: () => void;
  goOffline: () => void;
  receiveOffer: (offer: DeliveryOffer) => void;
  /** `accepted` keeps the order; `declined` and `expired` pass on it. */
  clearOffer: (outcome: 'accepted' | 'declined' | 'expired') => void;
  setActiveOrder: (id: ID | null) => void;
  reset: () => void;
}

/** A function, not a shared object — `reset()` must not hand back the same array. */
const initial = (): Pick<
  DispatchState,
  'online' | 'offer' | 'activeOrderId' | 'passedOrderIds'
> => ({
  online: false,
  offer: null,
  activeOrderId: null,
  passedOrderIds: [],
});

/**
 * The courier's dispatch state.
 *
 * Persisted because all three fields survive an app restart in real life: a
 * courier who was online is still online, a run in progress is still in
 * progress, and an order they passed on should not jump back at them because
 * they closed the app.
 *
 * The live *offer* is persisted too, which looks odd for something with a
 * 30-second life — but it carries its own `expiresAt`, so a stale one is
 * detected and cleared on the first tick rather than lingering. Dropping it on
 * restart would instead resurrect it as a fresh 30 seconds, which is the wrong
 * failure.
 */
export const useDispatchStore = create<DispatchState>()(
  persist(
    (set) => ({
      ...initial(),

      goOnline: () => set({ online: true }),

      // Going offline drops any pending offer: a courier who has just closed the
      // shutter must not have a countdown still running behind it.
      goOffline: () => set({ online: false, offer: null }),

      receiveOffer: (offer) => set({ offer }),

      clearOffer: (outcome) =>
        set((state) => {
          if (!state.offer) return state;
          const { orderId } = state.offer;
          if (outcome === 'accepted') {
            return { offer: null, activeOrderId: orderId };
          }
          return {
            offer: null,
            passedOrderIds: state.passedOrderIds.includes(orderId)
              ? state.passedOrderIds
              : [...state.passedOrderIds, orderId],
          };
        }),

      setActiveOrder: (id) => set({ activeOrderId: id }),

      reset: () => set(initial()),
    }),
    { name: 'sougouba-dispatch', storage: asyncStorage }
  )
);

export const selectHasActiveRun = (s: DispatchState): boolean => s.activeOrderId !== null;
