import { Camera, LineLayer, MapView, MarkerView, ShapeSource } from '@rnmapbox/maps';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import type { LatLng } from '@/data/types';
import { useT } from '@/lib/i18n/useT';
import { useColorScheme } from '@/hooks/useColorScheme';
import { splitPath } from '@/lib/courierRoute';
import { MAP_STYLES, initMapbox, mapboxReady } from '@/lib/mapbox';
import { MapFallback } from './MapFallback';
import {
  CourierMarker,
  DropoffMarker,
  PickupMarker,
  ROUTE_CASING_COLOR,
  ROUTE_CASING_WIDTH,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
  ROUTE_TRAVELLED_COLOR,
} from './MapMarkers';

export interface DeliveryMapProps {
  pickup: LatLng;
  dropoff: LatLng;
  courier?: LatLng | null;
  bearing?: number;
  route?: LatLng[];
  /**
   * How far along `route` the courier is, 0–1.
   *
   * Drives the dimming of the road already driven. Omitted (or 0) draws the
   * whole route at full weight, which is right for a trip nobody is on yet.
   */
  progress?: number;
  /** `full` fills a screen; `card` is the shopper's inline strip. */
  variant?: 'full' | 'card';
  /** Off on the shopper's card — it sits inside a scroll view. */
  interactive?: boolean;
  /**
   * Screen space covered by floating UI, so the camera frames the run in the
   * part of the map that is actually visible.
   *
   * Map-first layouts put a header and a sheet *over* the map rather than
   * beside it, so the visible rectangle is not the view's rectangle. Fitting
   * the route to the full view puts both ends of the trip — the two things
   * worth seeing — underneath the two things covering them.
   */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
}

/**
 * The only file in the app that renders Mapbox components. (`lib/mapbox.ts`
 * touches the module too, for `setAccessToken` alone.)
 *
 * Everything above it works in `LatLng`, so the map can be swapped, mocked or —
 * as happens whenever the token is missing — replaced wholesale by
 * `MapFallback` without a single caller knowing. That boundary is also what
 * keeps the native module off the import graph of screens that never show a map.
 *
 * Markers are the app's own components rather than Mapbox symbols: the brand
 * lives on top of the tiles, not in them (see `MAP_STYLES`).
 *
 * The route is drawn as three layers rather than one: a casing underneath so the
 * line survives a busy tile, the road already driven dimmed on top of it, and
 * the road ahead at full weight. Progress then reads off the shape of the line
 * itself, with no number to parse.
 */
export function DeliveryMap({
  pickup,
  dropoff,
  courier,
  bearing = 0,
  route,
  progress = 0,
  variant = 'full',
  interactive = true,
  padding,
}: DeliveryMapProps) {
  const t = useT();
  const { colorScheme } = useColorScheme();
  const cameraRef = useRef<Camera>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    initMapbox();
  }, []);

  const path = route?.length ? route : [pickup, dropoff];

  // Split on a coarse progress value: the run advances four times a second, and
  // re-cutting the polyline (and handing Mapbox two new GeoJSON features) at
  // that rate is work nobody can see. A hundredth of a route is a few metres of
  // line — below what a single frame would render differently anyway.
  const progressStep = Math.round(Math.min(1, Math.max(0, progress)) * 100) / 100;

  const { travelled, remaining } = useMemo(
    () => splitPath(path, progressStep),
    // `path` is rebuilt every render; its contents are what matter, and they
    // only change when the order does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, pickup, dropoff, progressStep]
  );

  // GeoJSON is [lng, lat] — the opposite order to everything else here, and the
  // single easiest thing to get backwards in this file.
  const fullLine = useMemo(() => lineFeature(path), [route, pickup, dropoff]); // eslint-disable-line react-hooks/exhaustive-deps
  const travelledLine = useMemo(() => lineFeature(travelled), [travelled]);
  const remainingLine = useMemo(() => lineFeature(remaining), [remaining]);

  /**
   * Frame the whole run, not the courier: a camera locked to the moving dot
   * hides where they are going, which is the one thing a shopper is watching
   * for.
   *
   * Quantised to roughly 200 m before the bounds are built. The courier's
   * coordinate is a fresh object on every tick, so an un-quantised memo produced
   * a new `bounds` prop four times a second and Mapbox restarted its 600 ms
   * fly-to on each one — a camera permanently mid-animation, which reads as the
   * map shivering rather than as the courier moving. On this grid the frame is
   * recomputed only when the run has actually gone somewhere.
   *
   * Falls back to a centred camera when the points collapse to one — which is
   * the normal idle state, where pickup, drop-off and courier are all the
   * courier's own base. Fitting a zero-area box gives Mapbox no usable zoom, and
   * the symptom is not an error but a blank grey map that still authenticates
   * and still places its markers, so it reads as a bad token for as long as it
   * takes to notice the bounds are degenerate.
   */
  const frameKey = [
    quantise(pickup.lat),
    quantise(pickup.lng),
    quantise(dropoff.lat),
    quantise(dropoff.lng),
    courier ? quantise(courier.lat) : 'x',
    courier ? quantise(courier.lng) : 'x',
  ].join(',');

  const camera = useMemo(() => {
    const points = [pickup, dropoff, ...(courier ? [courier] : [])];
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];

    // ~50 m. Below this the two ends are the same place as far as a map is
    // concerned, and a bounds fit would be dividing by roughly zero.
    const DEGENERATE = 0.0005;
    if (ne[0] - sw[0] < DEGENERATE && ne[1] - sw[1] < DEGENERATE) {
      return {
        kind: 'center' as const,
        centerCoordinate: [pickup.lng, pickup.lat] as [number, number],
        zoomLevel: 13.5,
      };
    }
    return { kind: 'bounds' as const, ne, sw };
    // Keyed on the quantised frame, not on the coordinate objects — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  if (!mapboxReady) {
    return (
      <MapFallback
        pickup={pickup}
        dropoff={dropoff}
        courier={courier}
        bearing={bearing}
        route={route}
        progress={progressStep}
        notice={t('courier.mapPreview')}
      />
    );
  }

  // The card is ~200pt tall, so 48pt top and bottom left barely 100pt to fit
  // the route into and pushed the camera out far enough to show Laval and
  // Longueuil either side of a five-kilometre trip. Enough to keep the markers
  // off the edge, no more.
  const base = variant === 'card' ? 26 : 88;
  const pad = {
    top: padding?.top ?? base,
    bottom: padding?.bottom ?? base,
    left: padding?.left ?? base,
    right: padding?.right ?? base,
  };

  return (
    <View
      className="flex-1 overflow-hidden"
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0 && (width !== size?.width || height !== size?.height)) {
          setSize({ width, height });
        }
      }}
    >
      {/* Mounted only once the container has been measured, and sized in
          explicit points rather than `flex: 1`.
          Under the new architecture the native map is created before flex
          layout has resolved, so it sees 0x0 and Mapbox's core logs
          "Invalid size is used for setting the map view, fall back to the
          default size {64, 64}". It never recovers: tiles are requested for a
          64-point viewport and immediately cancelled, and the map stays blank
          grey while happily authenticating — which reads as a bad token rather
          than a layout bug. Handing it real numbers avoids the guess entirely. */}
      {!size ? null : (
      <MapView
        style={{ width: size.width, height: size.height }}
        styleURL={colorScheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light}
        scaleBarEnabled={false}
        // Logo and attribution stay: Mapbox's terms require them, and they sit
        // bottom-left where nothing else does.
        logoEnabled
        attributionEnabled
        // No compass. Rotation is disabled below, so it could never point
        // anywhere but north — and it renders at the map's top-right, directly
        // under the courier's floating header, where it read as a dark blob
        // bleeding through the glass.
        compassEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Camera
          ref={cameraRef}
          {...(camera.kind === 'bounds'
            ? {
                bounds: {
                  ne: camera.ne,
                  sw: camera.sw,
                  paddingTop: pad.top,
                  paddingBottom: pad.bottom,
                  paddingLeft: pad.left,
                  paddingRight: pad.right,
                },
              }
            : { centerCoordinate: camera.centerCoordinate, zoomLevel: camera.zoomLevel })}
          animationDuration={600}
        />

        {/* Casing first, under everything: a 4pt forest line over a dark park
            polygon or a motorway ribbon is invisible at exactly the zooms a
            courier uses. */}
        <ShapeSource id="delivery-route-casing" shape={fullLine}>
          <LineLayer
            id="delivery-route-casing-line"
            style={{
              lineColor: ROUTE_CASING_COLOR,
              lineWidth: ROUTE_CASING_WIDTH,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: 0.55,
            }}
          />
        </ShapeSource>

        {travelled.length > 1 ? (
          <ShapeSource id="delivery-route-travelled" shape={travelledLine}>
            <LineLayer
              id="delivery-route-travelled-line"
              style={{
                lineColor: ROUTE_TRAVELLED_COLOR,
                lineWidth: ROUTE_LINE_WIDTH - 1,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.5,
              }}
            />
          </ShapeSource>
        ) : null}

        <ShapeSource
          id="delivery-route"
          shape={remaining.length > 1 ? remainingLine : fullLine}
        >
          <LineLayer
            id="delivery-route-line"
            style={{
              lineColor: ROUTE_LINE_COLOR,
              lineWidth: ROUTE_LINE_WIDTH,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: 0.95,
            }}
          />
        </ShapeSource>

        <MarkerView id="pickup" coordinate={[pickup.lng, pickup.lat]}>
          <PickupMarker />
        </MarkerView>
        <MarkerView id="dropoff" coordinate={[dropoff.lng, dropoff.lat]}>
          <DropoffMarker />
        </MarkerView>
        {courier ? (
          <MarkerView id="courier" coordinate={[courier.lng, courier.lat]}>
            {/* The sonar ring says "this position is current", so it is on only
                when there is a run under it. Idle, the Missions map still plots
                the courier — at their own base, going nowhere — and a pulse
                there would claim movement that is not happening. A route only
                exists once someone has accepted. */}
            <CourierMarker bearing={bearing} live={Boolean(route?.length)} />
          </MarkerView>
        ) : null}
      </MapView>
      )}
    </View>
  );
}

function lineFeature(points: LatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
    },
  };
}

/** ~200 m of latitude. Coarse enough that the camera settles between moves. */
const FRAME_GRID = 0.002;

function quantise(value: number): number {
  return Math.round(value / FRAME_GRID);
}
