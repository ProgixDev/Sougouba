import { Bike, MapPin, Store } from 'lucide-react-native';
import { MotiView } from 'moti';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { forest, mustard, neutral, terracotta } from '@/theme/tokens';

/**
 * The three things on a delivery map, drawn in the app's own palette rather
 * than with Mapbox's stock pins.
 *
 * Shared by `DeliveryMap` and `MapFallback` so the two never drift — the whole
 * point of the fallback is that it is the same picture without the tiles.
 */

const SHADOW = {
  shadowColor: neutral[950],
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.28,
  shadowRadius: 5,
  elevation: 4,
};

/** The shop. Forest, like every other merchant surface in the app. */
export function PickupMarker() {
  return (
    <View
      className="w-9 h-9 rounded-full items-center justify-center border-2"
      style={{ backgroundColor: forest[600], borderColor: '#FFFFFF', ...SHADOW }}
    >
      <Store size={17} color="#FFFFFF" strokeWidth={2.2} />
    </View>
  );
}

/** The shopper's door. Terracotta, matching the customer accent. */
export function DropoffMarker() {
  return (
    <View
      className="w-9 h-9 rounded-full items-center justify-center border-2"
      style={{ backgroundColor: terracotta[600], borderColor: '#FFFFFF', ...SHADOW }}
    >
      <MapPin size={17} color="#FFFFFF" strokeWidth={2.2} />
    </View>
  );
}

export interface CourierMarkerProps {
  /** Degrees, 0 = north. Rotates the disc so the courier faces where they drive. */
  bearing?: number;
  /** Adds the sonar ring. On only while a run is actually moving. */
  live?: boolean;
}

/** Outer bound of the halo — the marker's own footprint plus room for the ring. */
const PUCK = 44;
const HALO = 76;

/**
 * The courier. Mustard — the one accent neither of the other two roles uses, so
 * the moving dot never reads as "the shop" at a glance.
 *
 * `live` adds a slow sonar ring behind the puck. Under `DEMO_TIME_SCALE` the
 * marker does visibly travel, but a courier stopped at a light, waiting at the
 * counter, or sitting at 100 % progress is indistinguishable from a frozen
 * screen — the ring is what says the position is current rather than the last
 * one anyone heard. Two seconds, not one: this repeats for the whole run, and
 * anything quicker turns the map into a strobe.
 */
export function CourierMarker({ bearing = 0, live = false }: CourierMarkerProps) {
  const reducedMotion = useReducedMotion();
  const pulsing = live && !reducedMotion;

  return (
    <View style={{ width: HALO, height: HALO }} className="items-center justify-center">
      {pulsing ? (
        <MotiView
          from={{ opacity: 0.34, scale: 0.5 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ type: 'timing', duration: 2000, loop: true, repeatReverse: false }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: HALO,
            height: HALO,
            borderRadius: HALO / 2,
            backgroundColor: mustard[400],
          }}
        />
      ) : null}

      <View
        className="rounded-full items-center justify-center border-2"
        style={{
          width: PUCK,
          height: PUCK,
          backgroundColor: mustard[500],
          borderColor: '#FFFFFF',
          transform: [{ rotate: `${bearing}deg` }],
          ...SHADOW,
        }}
      >
        {/* Counter-rotated: the disc turns, the glyph stays readable. */}
        <View style={{ transform: [{ rotate: `${-bearing}deg` }] }}>
          <Bike size={19} color={neutral[950]} strokeWidth={2.2} />
        </View>
      </View>
    </View>
  );
}

/** The road ahead. */
export const ROUTE_LINE_COLOR = forest[600];
export const ROUTE_LINE_WIDTH = 4;
/** The road already driven — the same line, stepped back so it reads as past. */
export const ROUTE_TRAVELLED_COLOR = neutral[400];
/** Drawn under both, so the route survives a dark park or a motorway ribbon. */
export const ROUTE_CASING_COLOR = '#FFFFFF';
export const ROUTE_CASING_WIDTH = 8;
