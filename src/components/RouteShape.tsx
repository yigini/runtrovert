import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import type { RouteSig } from '../places';
import { colors } from '../theme';

/** A place's loop drawn as a small shape, from its saved route alone: no map, nothing fetched. */
export function RouteShape({ sig, size = 64, color = colors.ink, bg = colors.sunk }: { sig: RouteSig; size?: number; color?: string; bg?: string }) {
  const d = useMemo(() => shapePath(sig, size, size * 0.18), [sig, size]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={size} height={size} rx={size * 0.22} fill={bg} />
      <Path d={d} stroke={color} strokeWidth={Math.max(2, size / 24)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function shapePath(sig: RouteSig, size: number, pad: number): string {
  const pts = sig.pts;
  if (pts.length < 2) return '';
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [la, lo] of pts) {
    const x = lo * k;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, la);
    maxY = Math.max(maxY, la);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - pad * 2) / span;
  const ox = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
  const oy = pad + (size - pad * 2 - (maxY - minY) * scale) / 2;
  const step = Math.max(1, Math.floor(pts.length / 120));
  let d = '';
  const idx: number[] = [];
  for (let i = 0; i < pts.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== pts.length - 1) idx.push(pts.length - 1);
  for (const i of idx) {
    const x = ox + (pts[i][1] * k - minX) * scale;
    const y = oy + (maxY - pts[i][0]) * scale;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
