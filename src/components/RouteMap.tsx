import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
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

export function RouteMap({ path, follow, height = 220, offline = false }: { path: LatLon[]; follow?: boolean; height?: number; offline?: boolean }) {
  const cam = useRef<CameraRef>(null);
  const last = path[path.length - 1];
  const bounds = useMemo(() => boundsFor(path), [path.length]);

  const line = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: path.map((p) => [p.longitude, p.latitude]) },
    }),
    [path],
  );

  useEffect(() => {
    if (!cam.current) return;
    if (follow && last) cam.current.easeTo({ center: [last.longitude, last.latitude], zoom: 16, duration: 600 });
    else if (bounds) cam.current.fitBounds(bounds, { padding: { top: 28, right: 28, bottom: 28, left: 28 } });
  }, [follow, last?.latitude, last?.longitude, bounds]);

  const initial = last ? { center: [last.longitude, last.latitude] as [number, number], zoom: 15 } : { zoom: 1 };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={offline ? BLANK_STYLE : MAP_STYLE} logo={false} attribution={!offline} compass={false}>
        <Camera ref={cam} initialViewState={initial} />
        {path.length > 1 && (
          <GeoJSONSource id="route" data={line}>
            <Layer id="route-casing" type="line" paint={{ 'line-color': colors.cream, 'line-width': 8, 'line-opacity': 0.9 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': colors.ink, 'line-width': 4 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </GeoJSONSource>
        )}
        {last && (
          <GeoJSONSource id="head" data={{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [last.longitude, last.latitude] } }}>
            <Layer id="head-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.ink, 'circle-stroke-color': colors.cream, 'circle-stroke-width': 3 }} />
          </GeoJSONSource>
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.mintSoft },
});
