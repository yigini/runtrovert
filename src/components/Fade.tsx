import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, scheme, themedStyles, VEIL_FLOOR } from '../theme';

/**
 * A soft wash of cream over footage so ink text reads without a box behind it.
 * `from` is the edge where it's strongest.
 */
export function Fade({ from, height, strength = 0.85, color = colors.cream, style }: { from: 'top' | 'bottom'; height: number | `${number}%`; strength?: number; color?: string; style?: ViewStyle }) {
  const id = `fade-${from}`;
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }, from === 'top' ? { top: 0 } : { bottom: 0 }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1={from === 'top' ? '0' : '1'} x2="0" y2={from === 'top' ? '1' : '0'}>
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="0.55" stopColor={color} stopOpacity={strength * 0.6} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { position: 'absolute', left: 0, right: 0 },
}));

/**
 * One soft wash over the whole photo for screens with words on it: strongest at the top and bottom,
 * and never thinner than VEIL_FLOOR in between, so a bright or dark patch of footage can't swallow a
 * line of text wherever it lands. No hard edge, no box.
 */
export function Veil({ top = 0.88, bottom = 0.94 }: { top?: number; bottom?: number }) {
  const floor = VEIL_FLOOR[scheme()];
  const color = colors.cream;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: 0, bottom: 0 }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={Math.max(top, floor)} />
            <Stop offset="0.4" stopColor={color} stopOpacity={floor} />
            <Stop offset="0.6" stopColor={color} stopOpacity={floor} />
            <Stop offset="1" stopColor={color} stopOpacity={Math.max(bottom, floor)} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#veil)" />
      </Svg>
    </View>
  );
}
