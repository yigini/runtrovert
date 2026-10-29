import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { Sky } from '../forecast';
import { colors } from '../theme';

// Weather marks drawn with the same hand as the logo: one thick round stroke,
// one solid dot where it helps. No emoji, no clip-art.

const CLOUD = 'M15 33 H33 A7 7 0 0 0 33.6 19.1 A10 10 0 0 0 14.6 20.6 A6.2 6.2 0 0 0 15 33 Z';

export function SkyGlyph({ sky, isDay = true, size = 28, ink = colors.ink }: { sky: Sky; isDay?: boolean; size?: number; ink?: string }) {
  const s = { stroke: ink, strokeWidth: 3.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  if (sky === 'clear' && isDay) {
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180;
      return `M${24 + Math.cos(r) * 13} ${24 + Math.sin(r) * 13} L${24 + Math.cos(r) * 17.5} ${24 + Math.sin(r) * 17.5}`;
    });
    body = (
      <>
        <Circle cx="24" cy="24" r="7.5" fill={ink} />
        <Path d={rays.join(' ')} {...s} />
      </>
    );
  } else if (sky === 'clear') {
    body = <Path d="M30.5 9.5 A15 15 0 1 0 38.5 29.5 A11.5 11.5 0 0 1 30.5 9.5 Z" {...s} />;
  } else if (sky === 'fog') {
    body = <Path d="M9 17 H39 M13 24 H35 M9 31 H39" {...s} />;
  } else {
    const below =
      sky === 'rain' ? <Path d="M17 34 L15 40 M24 34 L22 40 M31 34 L29 40" {...s} /> :
      sky === 'drizzle' ? (
        <>
          <Circle cx="17" cy="38" r="2" fill={ink} />
          <Circle cx="24" cy="40" r="2" fill={ink} />
          <Circle cx="31" cy="38" r="2" fill={ink} />
        </>
      ) :
      sky === 'snow' ? (
        <>
          <Circle cx="16" cy="37" r="2.4" fill={ink} />
          <Circle cx="24" cy="40" r="2.4" fill={ink} />
          <Circle cx="32" cy="37" r="2.4" fill={ink} />
        </>
      ) :
      sky === 'storm' ? <Path d="M25.5 30 L21 36.5 H27 L22.5 43" {...s} /> :
      null;
    body = (
      <>
        <G transform={below ? 'translate(0 -5)' : undefined}>
          <Path d={CLOUD} {...s} />
        </G>
        {below}
      </>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {body}
    </Svg>
  );
}
