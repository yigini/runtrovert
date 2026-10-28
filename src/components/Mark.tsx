import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * The Runtrovert mark: a thick ring opened at one end, one dot inside.
 * A route with you alone on it. Same geometry as the app icon.
 */
export function Mark({ size = 48, ground = colors.cream, ink = colors.ink, tile = true }: { size?: number; ground?: string; ink?: string; tile?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      {tile && <Rect width="240" height="240" rx="54" fill={ground} />}
      <Path d="M185.7 102.4 A 68 68 0 1 1 137.6 54.3" stroke={ink} strokeWidth="32" strokeLinecap="round" fill="none" />
      <Circle cx="120" cy="120" r="24" fill={ink} />
    </Svg>
  );
}

/** Five energy faces, 1 = drained … 5 = recharged. */
export function Face({ level, size = 40, ink = colors.lilacDeep }: { level: 1 | 2 | 3 | 4 | 5; size?: number; ink?: string }) {
  const eyes =
    level === 5 ? (
      <Path d="M11 16 C 13 13, 16 13, 18 16 M22 16 C 24 13, 27 13, 29 16" stroke={ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    ) : (
      <>
        <Circle cx="14" cy="16" r="2.5" fill={ink} />
        <Circle cx="26" cy="16" r="2.5" fill={ink} />
      </>
    );
  const mouth = {
    1: 'M13 27 C 17 23, 23 23, 27 27',
    2: 'M14 26 C 17 25, 23 25, 26 26',
    3: 'M14 26 L 26 26',
    4: 'M14 25 C 17 28, 23 28, 26 25',
    5: 'M13 24 C 17 30, 23 30, 27 24',
  }[level];
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {eyes}
      <Path d={mouth} stroke={ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
