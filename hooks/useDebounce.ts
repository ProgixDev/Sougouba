import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value. Used by search so a keystroke doesn't fire a
 * request that a later keystroke immediately invalidates — the mock API has a
 * randomised 300–800ms delay, so un-debounced typing produces out-of-order
 * responses as well as pointless work.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
