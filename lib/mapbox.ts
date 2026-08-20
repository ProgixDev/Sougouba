import Mapbox from '@rnmapbox/maps';

/**
 * The one place the Mapbox public token is read.
 *
 * `EXPO_PUBLIC_` is what makes Expo inline the value into the bundle at build
 * time — which is the point, and also why this token is public by construction.
 * It is restricted in the Mapbox dashboard by bundle id, not by being hidden.
 * The *secret* download token is a build credential and never appears in JS at
 * all; see `.env.example`.
 *
 * When the token is absent every map surface renders `MapFallback` instead. The
 * app still builds, still runs and still demos — the same call
 * `lib/merchantOnboarding.ts` used to make about the registration portal: an
 * honest placeholder beats a blank rectangle or a crash.
 */
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? null;

export const mapboxReady = MAPBOX_TOKEN !== null && MAPBOX_TOKEN.startsWith('pk.');

let initialised = false;

/**
 * Idempotent. Called from the map component rather than at module load so a
 * screen that never shows a map never touches the native module.
 */
export function initMapbox(): void {
  if (initialised || !mapboxReady) return;
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  initialised = true;
}

/**
 * Mapbox's own light and dark styles.
 *
 * Deliberately not a custom Studio style: a bespoke style is a real design
 * asset with a real maintenance cost, and until someone has drawn one, the
 * stock styles under the app's own markers read better than a half-tuned
 * imitation. The brand lives in what sits on top of the map.
 */
export const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const;
