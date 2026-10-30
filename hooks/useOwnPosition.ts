import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/data/types';

export interface LivePosition extends LatLng {
  /** Compass degrees from the GPS, when the phone is moving fast enough to know. */
  heading?: number;
}

/**
 * This phone's position, followed while `enabled`.
 *
 * What the courier's own map draws: their real location, not an estimate. Null
 * until the first fix, and for good if location is refused — the map then shows
 * the route without a marker rather than a marker somewhere invented.
 *
 * Every ten metres or five seconds, whichever comes first: enough for the marker
 * to keep up with a bike, without holding the GPS at full power for a whole shift.
 */
export function useOwnPosition(enabled: boolean): LivePosition | null {
  const [position, setPosition] = useState<LivePosition | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        const granted =
          permission.granted ||
          (permission.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
        if (!granted || cancelled) return;

        // The last known fix first, so the marker appears now rather than after
        // a cold GPS start.
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (last && !cancelled) setPosition(toLive(last));

        const watch = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
          (fix) => setPosition(toLive(fix))
        );
        if (cancelled) watch.remove();
        else subscription = watch;
      } catch {
        // Location services off or unavailable: stay null, the map copes.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return enabled ? position : null;
}

function toLive(fix: Location.LocationObject): LivePosition {
  const heading = fix.coords.heading;
  return {
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    ...(heading !== null && heading >= 0 ? { heading } : {}),
  };
}
