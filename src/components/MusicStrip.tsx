import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { AppState, Image, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { appByKey, canControl, canShowNowPlaying, isPlaying, nowPlaying, nowPlayingAllowed, openPlaying, press, type NowPlaying } from '../music';
import { night, fonts, radius, themedStyles } from '../theme';
import { ui } from '../i18n/ui';

/**
 * One quiet row on the run screen: your music app on the left, and on Android
 * previous / play-pause / next for whatever is playing. If the runner turned on
 * notification access (Listen offers it), the left side shows the song's title,
 * artist and cover; otherwise nothing is read from the music app and the play
 * glyph only knows whether some audio is playing.
 */
export function MusicStrip({ appKey }: { appKey: string | null }) {
  const app = appByKey(appKey);
  const [playing, setPlaying] = useState(() => isPlaying());
  const [song, setSong] = useState<NowPlaying | null>(null);

  useEffect(() => {
    if (!canControl) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let reading = false;
    const tick = () => {
      setPlaying(isPlaying());
      if (reading) {
        const n = nowPlaying();
        setSong((was) => (was?.title === n?.title && was?.artist === n?.artist && was?.art === n?.art && was?.playing === n?.playing ? was : n));
      }
    };
    const start = () => {
      if (timer) return;
      // Checked again each time the app comes back, e.g. from Android's settings.
      reading = canShowNowPlaying && nowPlayingAllowed();
      if (!reading) setSong(null);
      tick();
      timer = setInterval(tick, 1500);
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
      {song ? (
        <Pressable
          onPress={() => openPlaying(song.app, appKey)}
          accessibilityRole="button"
          accessibilityLabel={ui().musicStrip.nowPlayingX(song.title, song.artist ?? '')}
          style={({ pressed }) => [styles.app, styles.song, pressed && { opacity: 0.8 }]}
        >
          {song.art ? (
            <Image source={{ uri: song.art }} style={styles.cover} accessible={false} importantForAccessibility="no" />
          ) : (
            <View style={[styles.cover, styles.coverBlank]}>
              <NoteGlyph />
            </View>
          )}
          <View style={{ flexShrink: 1, flex: 1 }}>
            <Text style={styles.appText} numberOfLines={1}>{song.title}</Text>
            {song.artist ? <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text> : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => openPlaying(null, appKey)}
          accessibilityRole="button"
          accessibilityLabel={ui().musicStrip.openX(name)}
          style={({ pressed }) => [styles.app, !canControl && { flex: 1 }, pressed && { opacity: 0.8 }]}
        >
          <NoteGlyph />
          <Text style={styles.appText} numberOfLines={1}>{canControl ? name : ui().musicStrip.openX(name)}</Text>
          <ArrowGlyph />
        </Pressable>
      )}
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
const S = { stroke: night.cream, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function PlayGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path d="M5.5 3.5 L14 9 L5.5 14.5 Z" {...S} fill={night.cream} />
    </Svg>
  );
}

function PauseGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Rect x={4.5} y={3.5} width={3} height={11} rx={1.2} fill={night.cream} />
      <Rect x={10.5} y={3.5} width={3} height={11} rx={1.2} fill={night.cream} />
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
      <Path d="M6 12 V3.4 L13 2 V10.8" stroke={night.lilac} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={4.2} cy={12} r={1.9} stroke={night.lilac} strokeWidth={1.6} fill="none" />
      <Circle cx={11.2} cy={10.8} r={1.9} stroke={night.lilac} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

function ArrowGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path d="M3.5 8.5 L8.5 3.5 M4.5 3.5 H8.5 V7.5" stroke={night.onInkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(43,39,51,0.78)', borderRadius: radius.pill, padding: 6 },
  app: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(246,241,234,0.08)' },
  appText: { flexShrink: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: night.cream },
  song: { paddingLeft: 6, paddingVertical: 4 },
  cover: { width: 36, height: 36, borderRadius: 8 },
  coverBlank: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,241,234,0.08)' },
  artist: { fontFamily: fonts.body, fontSize: 12, color: night.onInkMuted },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: 'rgba(217,208,240,0.22)' },
}));
