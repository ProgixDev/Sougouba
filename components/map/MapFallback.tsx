import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/components/ui';
import type { LatLng } from '@/data/types';
import { useColorScheme } from '@/hooks/useColorScheme';
import { forest } from '@/theme/tokens';
import { splitPath } from '@/lib/courierRoute';
import {
  CourierMarker,
  DropoffMarker,
  PickupMarker,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
  ROUTE_TRAVELLED_COLOR,
} from './MapMarkers';

export interface MapFallbackProps {
  pickup: LatLng;
  dropoff: LatLng;
  courier?: LatLng | null;
  bearing?: number;
  route?: LatLng[];
  /** How far along `route` the courier is, 0-1 — dims the road already driven. */
  progress?: number;
  /** Shown when there is no token at all, rather than on every render. */
  notice?: string;
}

/**
 * The map, without the tiles.
 *
 * Rendered when there is no Mapbox token (`lib/mapbox.ts`). It is not an error
 * state and does not look like one: the same three markers, the same route line,
 * the same brand gradient underneath — just no streets. The geometry is real,
 * projected from the same coordinates the live map would use, so a demo without
 * credentials still shows a courier moving between a shop and a door.
 *
 * The alternative — a grey box saying "carte indisponible" — would make a
 * missing environment variable look like a broken feature.
 */
export function MapFallback({
  pickup,
  dropoff,
  courier,
  bearing = 0,
  route,
  progress = 0,
  notice,
}: MapFallbackProps) {
  const { colorScheme } = useColorScheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const points = route?.length ? route : [pickup, dropoff];
  const project = makeProjector(
    courier ? [...points, courier] : points,
    size.width,
    size.height
  );

  const ready = size.width > 0 && size.height > 0;
  const toPath = (line: LatLng[]) =>
    line
      .map((p, i) => {
        const { x, y } = project(p);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

  // Same split as the live map, for the reason the fallback exists at all: the
  // two are meant to be the same picture, and progress that only reads on one
  // of them is a difference someone would notice in exactly the demo where the
  // token is missing.
  const { travelled, remaining } = splitPath(points, progress);
  const aheadPath = ready ? toPath(remaining.length > 1 ? remaining : points) : '';
  const behindPath = ready && travelled.length > 1 ? toPath(travelled) : '';

  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [forest[950], '#13231D']
            : [forest[50], forest[100]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />

      {ready ? (
        <>
          <Svg width={size.width} height={size.height} style={{ position: 'absolute' }}>
            {behindPath ? (
              <Path
                d={behindPath}
                stroke={ROUTE_TRAVELLED_COLOR}
                strokeWidth={ROUTE_LINE_WIDTH - 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="9 7"
                fill="none"
                opacity={0.5}
              />
            ) : null}
            <Path
              d={aheadPath}
              stroke={ROUTE_LINE_COLOR}
              strokeWidth={ROUTE_LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              // Dashed, so it reads as "roughly this way" rather than claiming
              // to be a surveyed route.
              strokeDasharray="9 7"
              fill="none"
              opacity={0.85}
            />
          </Svg>

          <Pin project={project} point={pickup} size={36}>
            <PickupMarker />
          </Pin>
          <Pin project={project} point={dropoff} size={36}>
            <DropoffMarker />
          </Pin>
          {courier ? (
            <Pin project={project} point={courier} size={76}>
              <CourierMarker bearing={bearing} live={Boolean(route?.length)} />
            </Pin>
          ) : null}
        </>
      ) : null}

      {notice ? (
        <View className="absolute left-3 right-3 bottom-3 rounded-2xl bg-card/90 px-3.5 py-2.5">
          <Text variant="caption" tone="muted" className="text-[12px] leading-[17px]">
            {notice}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Pin({
  project,
  point,
  size,
  children,
}: {
  project: (p: LatLng) => { x: number; y: number };
  point: LatLng;
  size: number;
  children: React.ReactNode;
}) {
  const { x, y } = project(point);
  return (
    <View style={{ position: 'absolute', left: x - size / 2, top: y - size / 2 }}>{children}</View>
  );
}

/**
 * Equirectangular projection fitted to the view.
 *
 * Longitude is scaled by cos(latitude) so the shape is not stretched sideways —
 * at Montréal's latitude that is a 30 % difference, which is the gap between a
 * route that looks like a route and one that looks squashed. Good enough over a
 * few kilometres; anything more principled belongs to the real map.
 */
function makeProjector(points: LatLng[], width: number, height: number) {
  const padding = 44;
  const midLat = points.reduce((s, p) => s + p.lat, 0) / (points.length || 1);
  const k = Math.cos((midLat * Math.PI) / 180);

  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  // One scale for both axes, so the route keeps its real proportions.
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return (p: LatLng) => ({
    x: (p.lng * k - minX) * scale + offsetX,
    y: (-p.lat - minY) * scale + offsetY,
  });
}
