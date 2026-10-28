import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, type CameraRef } from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

export function RouteMap({ path, here, follow, height = 220, offline = false }: { path: LatLon[]; here?: LatLon | null; follow?: boolean; height?: number; offline?: boolean }) {
  const cam = useRef<CameraRef>(null);
  const [ready, setReady] = useState(false);
  const centred = useRef(false);
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

  // Camera calls made before the map has loaded are dropped, so wait for it.
  useEffect(() => {
    if (!ready || !cam.current) return;
    if (follow && head) {
      const center: [number, number] = [head.longitude, head.latitude];
      if (!centred.current) cam.current.jumpTo({ center, zoom: 16 });
      else cam.current.easeTo({ center, duration: 600 });
      centred.current = true;
    } else if (bounds) cam.current.fitBounds(bounds, { padding: { top: 28, right: 28, bottom: 28, left: 28 } });
    else if (head) cam.current.jumpTo({ center: [head.longitude, head.latitude], zoom: 15 });
  }, [ready, follow, head?.latitude, head?.longitude, bounds]);

  const initial = head ? { center: [head.longitude, head.latitude] as [number, number], zoom: 15 } : { zoom: 1 };

  return (
    <View style={[styles.wrap, { height }]}>
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={offline ? BLANK_STYLE : MAP_STYLE} logo={false} attribution={!offline} compass={false} onDidFinishLoadingMap={() => setReady(true)}>
        <Camera ref={cam} initialViewState={initial} />
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
});
