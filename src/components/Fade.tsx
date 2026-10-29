import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

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

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
});
