import { Camera, GeoJSONSource, Layer, Map as MapLibreMap } from '@maplibre/maplibre-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';
import type { LatLon } from '../types';

/**
 * MapLibre: open source, no API key, no Google. Tiles come from a public
 * OpenFreeMap style (free, no key); swap MAP_STYLE for your own host later.
 * Offline/private mode: set MAP_STYLE to the blank style below — the route
 * still draws on a plain mint ground with no tile requests at all.
 */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

/** No tiles, nothing requested over the network. */
export const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': colors.mintSoft } }],
};

function boundsFor(path: LatLon[]): [number, number, number, number] | null {
  if (path.length < 2) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of path) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  return [minLon, minLat, maxLon, maxLat]; // west, south, east, north
}

type ViewPadding = { top: number; right: number; bottom: number; left: number };

export function RouteMap({
  path,
  here,
  follow,
  height = 220,
  offline = false,
  fill = false,
  interactive = true,
  focusPadding,
  fps,
}: {
  path: LatLon[];
  here?: LatLon | null;
  follow?: boolean;
  height?: number;
  offline?: boolean;
  /** Fill the parent edge to edge (live run background) instead of a rounded card. */
  fill?: boolean;
  interactive?: boolean;
  /** Where the live dot should sit when following, e.g. below overlaid numbers. */
  focusPadding?: ViewPadding;
  /** Cap the frame rate; a map behind the numbers doesn't need 60 fps. */
  fps?: number;
}) {
  const last = path[path.length - 1];
  // Live position wins over the route's end: we may be standing still, or the
  // filter may still be waiting for an accurate fix before it draws a line.
  const head = here ?? last;
  const bounds = useMemo(() => boundsFor(path), [path.length]);

  const line = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: path.map((p) => [p.longitude, p.latitude]) },
    }),
    [path],
  );

  // Declarative camera: MapLibre applies it once the map is ready, so there are
  // no imperative calls to lose if they arrive before the style has loaded.
  const padding = { top: 28, right: 28, bottom: 28, left: 28 };
  const view =
    follow && head
      ? { center: [head.longitude, head.latitude] as [number, number], zoom: 16, padding: focusPadding, duration: 600, easing: 'ease' as const }
      : bounds
        ? { bounds, padding, duration: 0 }
        : head
          ? { center: [head.longitude, head.latitude] as [number, number], zoom: 15, duration: 0 }
          : null;

  return (
    <View style={fill ? styles.fill : [styles.wrap, { height }]} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={offline ? BLANK_STYLE : MAP_STYLE}
        logo={false}
        attribution={!offline}
        attributionPosition={fill ? { top: 60, right: 12 } : undefined}
        compass={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        preferredFramesPerSecond={fps}
      >
        {view ? <Camera {...view} /> : <Camera initialViewState={{ zoom: 1 }} />}
        {path.length > 1 && (
          <GeoJSONSource id="route" data={line}>
            <Layer id="route-casing" type="line" paint={{ 'line-color': colors.cream, 'line-width': 8, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': colors.ink, 'line-width': 4 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {head && (
          <GeoJSONSource id="head" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [head.longitude, head.latitude] } }}>
            <Layer id="head-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.ink, 'circle-stroke-color': colors.cream, 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.mintSoft },
  fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.inkSoft },
});
