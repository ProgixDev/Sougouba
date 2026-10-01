import * as Location from 'expo-location';

import type { LatLng } from '@/data/types';

/** A fix this old is still "where the courier is" for dispatch — they were standing there a minute ago. */
const MAX_AGE_MS = 60_000;
/** A cold GPS start can take a while indoors; going online should not hang on it. */
const FIX_TIMEOUT_MS = 8_000;

/**
 * Where the courier is now, for the dispatcher and the shopper's tracking map.
 *
 * The API refuses to put a courier online without a position — it ranks
 * couriers by distance to the shop — so this always answers: the phone's
 * position when location is allowed, otherwise `fallback` (the base the courier
 * registered with), which is what the dispatcher used before GPS existed here.
 *
 * `null` only for `strict` callers — the live ping during a run — where a base
 * address pretending to be a moving courier would be worse than no ping.
 */
export async function courierPosition(fallback: LatLng): Promise<LatLng>;
export async function courierPosition(fallback: null): Promise<LatLng | null>;
export async function courierPosition(fallback: LatLng | null): Promise<LatLng | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    const granted = permission.granted || (permission.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
    if (!granted) return fallback;

    const recent = await Location.getLastKnownPositionAsync({ maxAge: MAX_AGE_MS });
    const fix =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
      ]));
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : fallback;
  } catch {
    return fallback;
  }
}
