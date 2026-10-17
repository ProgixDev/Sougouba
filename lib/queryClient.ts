import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

/**
 * How long a catalogue answer is trusted without re-asking.
 *
 * The catalogue is a marketplace's slowest-moving data — shops, categories and
 * shelves change when a merchant edits them, not second by second — so a
 * minute of trust is generous to the shopper and still fresh enough that a
 * price edit shows up on the next screen. Before this cache existed every
 * screen mount refetched, so going home → cart → home paid for the catalogue
 * three times.
 */
const CATALOGUE_STALE_MS = 60_000;

/** Kept in memory well past `staleTime`, so returning to a screen paints from cache and revalidates behind it. */
const GC_MS = 15 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CATALOGUE_STALE_MS,
      gcTime: GC_MS,
      /**
       * One retry, not three.
       *
       * A phone's requests fail for two reasons: the network dropped, where a
       * single prompt retry usually wins, and the API said no, where retrying
       * changes nothing. Three attempts with backoff turns the second case
       * into a screen that spins for seconds before admitting failure — and a
       * 4xx is never worth repeating at all.
       */
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

/**
 * Teach `focusManager` what "focused" means on a phone.
 *
 * React Query's default is a browser's `visibilitychange`, which never fires
 * in React Native — so without this, `refetchOnWindowFocus` is dead code and a
 * shopper returning to a backgrounded app sees whatever the cache held. On web
 * the built-in listener is already correct, hence the platform check.
 *
 * Returns the unsubscribe so the caller can tear it down; `AppState`
 * subscriptions outlive a Fast Refresh otherwise and stack up.
 */
export function watchAppFocus(): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
