import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import type { Footage } from '../footage';
import { useStillFootage } from '../motion';
import { colors, scheme, themedStyles } from '../theme';

// Styles: graded real-footage loops (src/footage.ts, assets/CREDITS.md,
// scripts/grade-bg.sh) and three drawn in code (scripts/make-bg-video.mjs).
export type BgStyle = Footage | 'painterly' | 'flat' | 'abstract';
const DEFAULT_STYLE: BgStyle = 'sunset-beach';
const DARK_SHADE = 0.3;
const SOURCES: Record<BgStyle, { video: number; poster: number }> = {
  'sunset-beach': { video: require('../../assets/bg-sunset-beach.mp4'), poster: require('../../assets/bg-sunset-beach.jpg') },
  'mist-beach': { video: require('../../assets/bg-mist-beach.mp4'), poster: require('../../assets/bg-mist-beach.jpg') },
  'snow-plain': { video: require('../../assets/bg-snow-plain.mp4'), poster: require('../../assets/bg-snow-plain.jpg') },
  'grey-path': { video: require('../../assets/bg-grey-path.mp4'), poster: require('../../assets/bg-grey-path.jpg') },
  'rock-coast': { video: require('../../assets/bg-rock-coast.mp4'), poster: require('../../assets/bg-rock-coast.jpg') },
  'green-tunnel': { video: require('../../assets/bg-green-tunnel.mp4'), poster: require('../../assets/bg-green-tunnel.jpg') },
  'dirt-road': { video: require('../../assets/bg-dirt-road.mp4'), poster: require('../../assets/bg-dirt-road.jpg') },
  'grey-beach': { video: require('../../assets/bg-grey-beach.mp4'), poster: require('../../assets/bg-grey-beach.jpg') },
  'winter-city': { video: require('../../assets/bg-winter-city.mp4'), poster: require('../../assets/bg-winter-city.jpg') },
  'trail-bridge': { video: require('../../assets/bg-trail-bridge.mp4'), poster: require('../../assets/bg-trail-bridge.jpg') },
  'rice-field': { video: require('../../assets/bg-rice-field.mp4'), poster: require('../../assets/bg-rice-field.jpg') },
  'park-trees': { video: require('../../assets/bg-park-trees.mp4'), poster: require('../../assets/bg-park-trees.jpg') },
  'track-day': { video: require('../../assets/bg-track-day.mp4'), poster: require('../../assets/bg-track-day.jpg') },
  'dirt-track': { video: require('../../assets/bg-dirt-track.mp4'), poster: require('../../assets/bg-dirt-track.jpg') },
  'leafy-lane': { video: require('../../assets/bg-leafy-lane.mp4'), poster: require('../../assets/bg-leafy-lane.jpg') },
  'bare-woods': { video: require('../../assets/bg-bare-woods.mp4'), poster: require('../../assets/bg-bare-woods.jpg') },
  'tree-avenue': { video: require('../../assets/bg-tree-avenue.mp4'), poster: require('../../assets/bg-tree-avenue.jpg') },
  'lake-side': { video: require('../../assets/bg-lake-side.mp4'), poster: require('../../assets/bg-lake-side.jpg') },
  'glass-river': { video: require('../../assets/bg-glass-river.mp4'), poster: require('../../assets/bg-glass-river.jpg') },
  'night-park': { video: require('../../assets/bg-night-park.mp4'), poster: require('../../assets/bg-night-park.jpg') },
  'sunny-park': { video: require('../../assets/bg-sunny-park.mp4'), poster: require('../../assets/bg-sunny-park.jpg') },
  'river-bridge': { video: require('../../assets/bg-river-bridge.mp4'), poster: require('../../assets/bg-river-bridge.jpg') },
  'sunset-water': { video: require('../../assets/bg-sunset-water.mp4'), poster: require('../../assets/bg-sunset-water.jpg') },
  cobbles: { video: require('../../assets/bg-cobbles.mp4'), poster: require('../../assets/bg-cobbles.jpg') },
  'blade-stride': { video: require('../../assets/bg-blade-stride.mp4'), poster: require('../../assets/bg-blade-stride.jpg') },
  'sun-trees': { video: require('../../assets/bg-sun-trees.mp4'), poster: require('../../assets/bg-sun-trees.jpg') },
  'sea-road': { video: require('../../assets/bg-sea-road.mp4'), poster: require('../../assets/bg-sea-road.jpg') },
  'dark-forest': { video: require('../../assets/bg-dark-forest.mp4'), poster: require('../../assets/bg-dark-forest.jpg') },
  painterly: { video: require('../../assets/bg-painterly.mp4'), poster: require('../../assets/bg-painterly.jpg') },
  flat: { video: require('../../assets/bg-flat.mp4'), poster: require('../../assets/bg-flat.jpg') },
  abstract: { video: require('../../assets/bg-abstract.mp4'), poster: require('../../assets/bg-abstract.jpg') },
};

/**
 * A muted loop behind a screen. Never touches other apps' audio, pauses when
 * the app is backgrounded, and shows only the poster when the runner asked for
 * still backgrounds, the phone is set to reduce motion, or battery saver is on
 * (or when `still` is passed). The poster is painted underneath so there's no flash while the
 * decoder spins up. Fully local: nothing is fetched.
 */
export function AmbientBackground({ children, dim = 0, style = DEFAULT_STYLE, still: forceStill = false, paused = false }: { children?: React.ReactNode; dim?: number; style?: BgStyle; still?: boolean; /** Hidden behind another tab or Settings: the decoder rests and only the poster stays. */ paused?: boolean }) {
  const still = useStillFootage() || forceStill || paused;
  // In the dark palette the footage sits a little lower, like a cinema, so light words on the dusk wash stay easy to read.
  const shade = Math.max(dim, scheme() === 'dark' ? DARK_SHADE : 0);
  const { video: VIDEO, poster: POSTER } = SOURCES[style];
  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = false;
    if (!still) p.play();
  });

  useEffect(() => {
    if (still) player.pause();
    else player.play();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !still) player.play();
      else player.pause();
    });
    return () => sub.remove();
  }, [player, still]);

  return (
    <View style={styles.root}>
      <Image source={POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {/* textureView, not the default surfaceView: on Android a SurfaceView ignores its parent's
          bounds, so a "cover" loop taller than the screen spilled out under the tab bar and the
          gesture bar. A TextureView is clipped like any other view. */}
      {!still && <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" surfaceType="textureView" nativeControls={false} allowsPictureInPicture={false} />}
      {shade > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cream, opacity: shade }]} />}
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, overflow: 'hidden', backgroundColor: colors.sky },
}));
