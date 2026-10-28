import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

// Styles: two graded real-footage loops (assets/CREDITS.md) and three drawn in code.
export type BgStyle = 'dusk' | 'tree' | 'painterly' | 'flat' | 'abstract';
const DEFAULT_STYLE: BgStyle = 'dusk';
const SOURCES = {
  dusk: { video: require('../../assets/bg-dusk.mp4'), poster: require('../../assets/bg-dusk-poster.png') },
  tree: { video: require('../../assets/bg-tree.mp4'), poster: require('../../assets/bg-tree-poster.png') },
  painterly: { video: require('../../assets/bg-painterly.mp4'), poster: require('../../assets/bg-painterly-poster.png') },
  flat: { video: require('../../assets/bg-flat.mp4'), poster: require('../../assets/bg-flat-poster.png') },
  abstract: { video: require('../../assets/bg-abstract.mp4'), poster: require('../../assets/bg-abstract-poster.png') },
};

/**
 * The quiet-dawn loop, drawn in code from the brand palette (scripts/make-bg-video.mjs).
 * Muted, loops seamlessly, never touches other apps' audio, pauses when the
 * app is backgrounded. The poster is painted underneath so there's no flash
 * while the decoder spins up. Fully local: nothing is fetched.
 */
export function AmbientBackground({ children, dim = 0, style = DEFAULT_STYLE }: { children?: React.ReactNode; dim?: number; style?: BgStyle }) {
  const { video: VIDEO, poster: POSTER } = SOURCES[style];
  const player = useVideoPlayer(VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.staysActiveInBackground = false;
    p.play();
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') player.play();
      else player.pause();
    });
    return () => sub.remove();
  }, [player]);

  return (
    <View style={styles.root}>
      <Image source={POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
      {dim > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cream, opacity: dim }]} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.sky },
});
