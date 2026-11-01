import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ScreenActive } from '../back';
import { meFootage } from '../me';
import { colors, FILM, scheme, spacing, themedStyles } from '../theme';
import { AmbientBackground } from './AmbientBackground';

// The film header every tab shares. Me has the tall one (MeScreen); Your runs and Train have a
// short band that holds only their title and one line. The same loops, the same dark scrim, the
// same light words and the same cream sheet edge, so the tabs read as one family. Pages you go
// into (Settings, a run, a plan's setup) stay plain cream with a back link.

/** How far the cream sheet slides up over the foot of the film. */
export const SHEET_OVERLAP = 28;

/**
 * Where a tab stands with its film, for App: 'none' (this view has no film, keep the clock's own
 * inset), 'film' (film under the clock: light icons), 'ground' (scrolled past it: the theme's icons
 * over a strip of ground colour).
 */
export type FilmState = 'none' | 'film' | 'ground';

/** App gives each tab its own reporter; a band and its scroll tell App where the film is. */
export const FilmReport = createContext<(s: FilmState) => void>(() => {});

/**
 * The dark scrim over the film: heavier under the clock and title, darkest at the foot. Sized in
 * numbers from the header's own layout (a percentage-sized Svg can keep its first, shorter size on
 * Android). Until the header is measured, a flat scrim at the floor stands in, so words are never on
 * bare footage. The band is short and all words, so its scrim never gets as light as the tall one's middle.
 */
export function FilmScrim({ w, h, band = false }: { w: number; h: number; band?: boolean }) {
  const id = band ? 'bandScrim' : 'meScrim';
  if (w === 0 || h === 0) return <View style={[StyleSheet.absoluteFill, { backgroundColor: FILM.scrim, opacity: 0.6 }]} />;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        {band ? (
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FILM.scrim} stopOpacity={0.62} />
            <Stop offset="0.45" stopColor={FILM.scrim} stopOpacity={0.5} />
            <Stop offset="1" stopColor={FILM.scrim} stopOpacity={0.82} />
          </LinearGradient>
        ) : (
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FILM.scrim} stopOpacity={0.6} />
            <Stop offset="0.3" stopColor={FILM.scrim} stopOpacity={FILM.scrimFloor} />
            <Stop offset="0.55" stopColor={FILM.scrim} stopOpacity={0.55} />
            <Stop offset="1" stopColor={FILM.scrim} stopOpacity={0.88} />
          </LinearGradient>
        )}
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The scroll side of a film header: tells App when the sheet has scrolled up under the clock, and
 * gives back a strip of ground colour to lay behind the clock from then on.
 */
export function useFilmScroll(bandHeight: number, resetKey?: unknown) {
  const insets = useSafeAreaInsets();
  const report = useContext(FilmReport);
  const [over, setOver] = useState(true);
  const flip = Math.max(1, bandHeight - insets.top - SHEET_OVERLAP);
  const overRef = useRef(true);
  // A new list (Runs to Places, a new plan view) starts at the top, film under the clock again.
  useEffect(() => {
    overRef.current = true;
    setOver(true);
  }, [resetKey]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const now = e.nativeEvent.contentOffset.y < flip;
    if (now !== overRef.current) {
      overRef.current = now;
      setOver(now);
      report(now ? 'film' : 'ground');
    }
  };
  const strip = over ? null : <View pointerEvents="none" style={[styles.strip, { height: insets.top }]} />;
  return { onScroll, strip };
}

/**
 * The short band: full width, up behind the clock, one slow loop (a still when the tab is hidden,
 * under battery saver, reduced motion or still backgrounds) under the band scrim. `offset` picks a
 * different loop of the day's set than Me's, so each tab feels like its own room. The cream sheet's
 * rounded edge follows; put the rest of the screen after it.
 *
 * Sits at the top of a scroll whose content is padded `spacing.md` at the sides and `topPad` at the
 * top: the band reaches past that padding to the screen's edges.
 */
export function FilmBand({ children, offset, topPad = 0, onHeight }: { children: React.ReactNode; offset: number; topPad?: number; onHeight?: (h: number) => void }) {
  const insets = useSafeAreaInsets();
  const active = useContext(ScreenActive);
  const report = useContext(FilmReport);
  const dark = scheme() === 'dark';
  const footage = useMemo(() => meFootage(Date.now(), dark, offset), [dark, offset]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    report('film');
    return () => report('none');
  }, [report]);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    if (w !== size.w || h !== size.h) {
      setSize({ w, h });
      onHeight?.(h);
    }
  };
  return (
    <View style={{ marginHorizontal: -spacing.md, marginTop: -topPad }}>
      <View style={[styles.band, { paddingTop: insets.top + spacing.md }]} onLayout={onLayout}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <AmbientBackground style={footage} paused={!active} />
          <FilmScrim w={size.w} h={size.h} band />
        </View>
        {children}
      </View>
      <View style={styles.sheetEdge}>
        <View style={styles.grip} />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  band: { paddingHorizontal: spacing.md, paddingBottom: SHEET_OVERLAP + spacing.md, gap: spacing.sm, overflow: 'hidden' },
  sheetEdge: { marginTop: -SHEET_OVERLAP, height: SHEET_OVERLAP, backgroundColor: colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: 'center', paddingTop: 10 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.cream },
}));
