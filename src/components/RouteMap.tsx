import { Camera, GeoJSONSource, Layer, Map as MapLibreMap } from '@maplibre/maplibre-react-native';
import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { boundsFor, fitBounds } from '../mapFit';
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
  fitPadding,
  markers,
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
  /** Space to keep clear when framing the whole route, e.g. under a summary card. */
  fitPadding?: ViewPadding;
  /** Start and finish dots. On by default whenever we're not following. */
  markers?: boolean;
  /** Cap the frame rate; a map behind the numbers doesn't need 60 fps. */
  fps?: number;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size?.w || height !== size?.h)) setSize({ w: width, h: height });
  };
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

  // Declarative camera. For a whole route we work out centre and zoom ourselves
  // once the view has a size (see mapFit.ts): MapLibre's own bounds fit can run
  // before layout on Android and come back as the whole world.
  const pad = fitPadding ?? { top: 28, right: 28, bottom: 28, left: 28 };
  const fit = useMemo(
    () => (bounds && size ? fitBounds(bounds, size.w, size.h, pad) : null),
    [bounds, size?.w, size?.h, pad.top, pad.right, pad.bottom, pad.left],
  );
  const view =
    follow && head
      ? { center: [head.longitude, head.latitude] as [number, number], zoom: 16, padding: focusPadding, duration: 600, easing: 'ease' as const }
      : fit
        ? { center: fit.center, zoom: fit.zoom, duration: 0 }
        : null;
  // Until we can fit, start near the run rather than at zoom 1 over the globe.
  const start = path[0] ?? head;
  const initial = start ? { center: [start.longitude, start.latitude] as [number, number], zoom: 14 } : { zoom: 1 };
  const showMarkers = (markers ?? !follow) && path.length > 1;
  const first = path[0];

  return (
    <View style={fill ? styles.fill : [styles.wrap, { height }]} pointerEvents={interactive ? 'auto' : 'none'} onLayout={onLayout}>
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
        {view ? <Camera initialViewState={initial} {...view} /> : <Camera initialViewState={initial} />}
        {path.length > 1 && (
          <GeoJSONSource id="route" data={line}>
            <Layer id="route-casing" type="line" paint={{ 'line-color': colors.cream, 'line-width': 8, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': colors.ink, 'line-width': 4 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {showMarkers ? (
          <GeoJSONSource
            id="ends"
            data={{
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', properties: { end: 0 }, geometry: { type: 'Point', coordinates: [first.longitude, first.latitude] } },
                { type: 'Feature', properties: { end: 1 }, geometry: { type: 'Point', coordinates: [last.longitude, last.latitude] } },
              ],
            }}
          >
            <Layer
              id="ends-dot"
              type="circle"
              paint={{
                'circle-radius': ['match', ['get', 'end'], 0, 7, 9],
                'circle-color': ['match', ['get', 'end'], 0, colors.mint, colors.peach],
                'circle-stroke-color': colors.ink,
                'circle-stroke-width': 3,
              }}
            />
          </GeoJSONSource>
        ) : (
          head && (
            <GeoJSONSource id="head" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [head.longitude, head.latitude] } }}>
              <Layer id="head-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.ink, 'circle-stroke-color': colors.cream, 'circle-stroke-width': 3 }} />
            </GeoJSONSource>
          )
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.mintSoft },
  fill: { ...StyleSheet.absoluteFill, backgroundColor: colors.inkSoft },
});
