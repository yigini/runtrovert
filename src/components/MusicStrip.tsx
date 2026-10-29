import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { appByKey, canControl, isPlaying, openMusicApp, press } from '../music';
import { colors, fonts, radius } from '../theme';
import { ui } from '../i18n/ui';

/**
 * One quiet row on the run screen: your music app on the left, and on Android
 * previous / play-pause / next for whatever is playing. Nothing is read from
 * the music app; the play glyph only knows whether some audio is playing.
 */
export function MusicStrip({ appKey }: { appKey: string | null }) {
  const app = appByKey(appKey);
  const [playing, setPlaying] = useState(() => isPlaying());

  useEffect(() => {
    if (!canControl) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      setPlaying(isPlaying());
      timer = setInterval(() => setPlaying(isPlaying()), 1500);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  function onPress(cmd: 'toggle' | 'next' | 'previous') {
    Haptics.selectionAsync();
    press(cmd);
    if (cmd === 'toggle') setPlaying((p) => !p);
    setTimeout(() => setPlaying(isPlaying()), 700);
  }

  const name = app?.name ?? ui().musicStrip.music;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => openMusicApp(appKey)}
        accessibilityRole="button"
        accessibilityLabel={ui().musicStrip.openX(name)}
        style={({ pressed }) => [styles.app, !canControl && { flex: 1 }, pressed && { opacity: 0.8 }]}
      >
        <NoteGlyph />
        <Text style={styles.appText} numberOfLines={1}>{canControl ? name : ui().musicStrip.openX(name)}</Text>
        <ArrowGlyph />
      </Pressable>
      {canControl && (
        <View style={styles.buttons}>
          <Btn label={ui().musicStrip.previousTrack} onPress={() => onPress('previous')}>
            <SkipGlyph flip />
          </Btn>
          <Btn label={playing ? ui().musicStrip.pauseMusic : ui().musicStrip.playMusic} onPress={() => onPress('toggle')} main>
            {playing ? <PauseGlyph /> : <PlayGlyph />}
          </Btn>
          <Btn label={ui().musicStrip.nextTrack} onPress={() => onPress('next')}>
            <SkipGlyph />
          </Btn>
        </View>
      )}
    </View>
  );
}

function Btn({ label, onPress, main, children }: { label: string; onPress: () => void; main?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.btn, main && styles.btnMain, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

// Glyphs drawn with the same round stroke as the rest of the app.
const S = { stroke: colors.cream, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function PlayGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M5.5 3.5 L14 9 L5.5 14.5 Z" {...S} fill={colors.cream} />
    </Svg>
  );
}

function PauseGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Rect x={4.5} y={3.5} width={3} height={11} rx={1.2} fill={colors.cream} />
      <Rect x={10.5} y={3.5} width={3} height={11} rx={1.2} fill={colors.cream} />
    </Svg>
  );
}

function SkipGlyph({ flip }: { flip?: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Path d="M4 4.5 L11 9 L4 13.5 Z" {...S} />
      <Path d="M14 4.5 L14 13.5" {...S} />
    </Svg>
  );
}

function NoteGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d="M6 12 V3.4 L13 2 V10.8" stroke={colors.lilac} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={4.2} cy={12} r={1.9} stroke={colors.lilac} strokeWidth={1.6} fill="none" />
      <Circle cx={11.2} cy={10.8} r={1.9} stroke={colors.lilac} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

function ArrowGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path d="M3.5 8.5 L8.5 3.5 M4.5 3.5 H8.5 V7.5" stroke={colors.onInkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(43,39,51,0.78)', borderRadius: radius.pill, padding: 6 },
  app: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(246,241,234,0.08)' },
  appText: { flexShrink: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.cream },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: 'rgba(217,208,240,0.22)' },
});
