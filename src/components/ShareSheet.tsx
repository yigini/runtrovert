import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { distanceUnit, formatDistanceNumber, formatDuration, formatPace } from '../geo';
import { formatClock, type Comparison } from '../progress';
import { pickLine, type RunWeather, type Tone } from '../shareLines';
import { routePath } from '../shareShape';
import { colors, fonts, radius, spacing, type, themedStyles, themed } from '../theme';
import type { LatLon, Mood, Quiet } from '../types';
import { Button } from './Button';
import { Face, Mark } from './Mark';
import { ui } from '../i18n/ui';
import { dateLocale } from '../i18n/lang';

// "Share with someone": a card drawn on the phone and handed to the phone's
// own share sheet. Runtrovert never sees where it goes. The route is off by
// default; when on it's a bare line with its ends trimmed, the date is a day and a rough time, and the
// line under the number is written from this run's own facts.

export interface ShareRun {
  id: number;
  startedAt: number;
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  moodBefore: Mood | null;
  moodAfter: Mood | null;
  quiet: Quiet | null;
}

type StatKind = 'distance' | 'time' | 'pace' | 'best' | 'energy';

const TONE: Record<Tone, string> = themed(() => ({ mint: colors.mint, butter: colors.butter, sky: colors.sky, peach: colors.peach, lilac: colors.lilac }));
const CARD_RATIO = 1350 / 1080;

function roughTime(ms: number): string {
  const h = new Date(ms).getHours();
  const t = ui().shareSheet;
  return h < 7 ? t.earlyMorning : h < 11 ? t.morning : h < 14 ? t.midday : h < 17 ? t.afternoon : h < 21 ? t.evening : t.night;
}

export function ShareSheet({
  visible,
  onClose,
  run,
  path,
  cmp,
  weather,
  km,
}: {
  visible: boolean;
  onClose: () => void;
  run: ShareRun;
  path: LatLon[];
  cmp: Comparison;
  weather: RunWeather | null;
  km: boolean;
}) {
  const [turn, setTurn] = useState(0);
  const [showRoute, setShowRoute] = useState(false);
  const recharge = run.moodBefore != null && run.moodAfter != null ? run.moodAfter - run.moodBefore : null;
  const [stat, setStat] = useState<StatKind>(cmp.best ? 'best' : recharge != null && recharge >= 2 ? 'energy' : 'distance');
  const [busy, setBusy] = useState(false);
  const card = useRef<React.ComponentRef<typeof View>>(null);

  const W = Math.min(Dimensions.get('window').width - spacing.md * 2, 400);
  const H = Math.round(W * CARD_RATIO);
  const u = W / 360;

  const picked = useMemo(
    () =>
      pickLine(
        { runId: run.id, startedAt: run.startedAt, distanceM: run.distanceM, durationS: run.durationS, climbM: run.elevationGainM, km, metric: km, quiet: run.quiet, weather, cmp },
        turn,
      ),
    [run, weather, cmp, km, turn],
  );
  const routeBox = { w: W - 56 * u, h: H * 0.42 };
  const d = useMemo(() => (showRoute ? routePath(path, routeBox.w, routeBox.h, 8 * u) : null), [path, showRoute, routeBox.w, routeBox.h, u]);

  const options: Array<{ key: StatKind; label: string }> = [
    ...(cmp.best ? [{ key: 'best' as const, label: ui().shareSheet.best }] : []),
    { key: 'distance', label: ui().shareSheet.distance },
    { key: 'time', label: ui().shareSheet.time },
    { key: 'pace', label: ui().shareSheet.pace },
    ...(recharge != null ? [{ key: 'energy' as const, label: ui().shareSheet.energy }] : []),
  ];

  const big = (() => {
    const unit = distanceUnit(km);
    if (stat === 'best' && cmp.best) return { value: formatClock(cmp.best.seconds), sub: cmp.best.marginS == null ? ui().shareSheet.firstX(cmp.best.label) : ui().shareSheet.newXBest(cmp.best.label) };
    if (stat === 'time') return { value: formatDuration(run.durationS), sub: `${formatDistanceNumber(run.distanceM, km)} ${unit}` };
    if (stat === 'pace') return { value: formatPace(run.distanceM, run.durationS, km), sub: ui().shareSheet.perXXX(unit, formatDistanceNumber(run.distanceM, km), unit) };
    if (stat === 'energy') return { value: '', sub: ui().shareSheet.xXEnergyBeforeAnd(formatDistanceNumber(run.distanceM, km), unit) };
    return { value: `${formatDistanceNumber(run.distanceM, km)} ${unit}`, sub: `${formatDuration(run.durationS)} · ${formatPace(run.distanceM, run.durationS, km)} /${unit}` };
  })();

  const faces = stat === 'energy' && run.moodBefore != null && run.moodAfter != null ? { before: run.moodBefore, after: run.moodAfter } : null;
  const when = `${new Date(run.startedAt).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })} · ${roughTime(run.startedAt)}`;

  async function onShare() {
    if (!card.current || busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(card.current as never /* view-shot's types predate RN 0.88's element refs */, { format: 'png', quality: 1, width: 1080, height: 1350, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(ui().shareSheet.sharingIsnTAvailable, ui().shareSheet.thisPhoneHasNoShare);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: ui().shareSheet.shareWithSomeone });
    } catch (e) {
      Alert.alert(ui().shareSheet.couldnTMakeTheCard, String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView style={{ flex: 1, backgroundColor: colors.cream }} contentContainerStyle={styles.sheet}>
        <View style={{ gap: 4 }}>
          <Text style={type.eyebrow}>{ui().shareSheet.shareWithSomeone}</Text>
          <Text style={styles.lede}>{ui().shareSheet.madeOnThisPhoneYou}</Text>
        </View>

        <View ref={card} collapsable={false} style={[styles.card, { width: W, height: H, backgroundColor: TONE[picked.tone], padding: 28 * u, borderRadius: 26 * u }]}>
          <View style={{ height: routeBox.h, justifyContent: 'center' }}>
            {d ? (
              <Svg width={routeBox.w} height={routeBox.h}>
                <Path d={d} stroke={colors.ink} strokeWidth={6 * u} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            ) : faces ? (
              <EnergyFaces before={faces.before} after={faces.after} u={u} />
            ) : (
              <Mark size={64 * u} tile={false} ink={colors.ink} />
            )}
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end', gap: 6 * u }}>
            {faces ? (
              d ? <EnergyFaces before={faces.before} after={faces.after} u={u * 0.8} /> : null
            ) : (
              <Text style={[styles.stat, { fontSize: 60 * u, lineHeight: 64 * u }]} numberOfLines={1} adjustsFontSizeToFit>{big.value}</Text>
            )}
            <Text style={[styles.sub, { fontSize: 12 * u, letterSpacing: 1.6 * u }]}>{big.sub}</Text>
            <Text style={[styles.line, { fontSize: 21 * u, lineHeight: 28 * u, marginTop: 10 * u }]}>{picked.line}</Text>
          </View>
          <View style={[styles.foot, { marginTop: 18 * u }]}>
            <Text style={[styles.footText, { fontSize: 11 * u, letterSpacing: 1.4 * u }]}>{when}</Text>
            <Mark size={22 * u} tile={false} ink={colors.ink} />
          </View>
        </View>

        <View style={styles.row}>
          <Chip label={ui().shareSheet.anotherLine} onPress={() => { Haptics.selectionAsync(); setTurn((t) => t + 1); }} strong />
          <Chip label={showRoute ? ui().shareSheet.routeOn : ui().shareSheet.routeOff} on={showRoute} onPress={() => setShowRoute((s) => !s)} />
        </View>
        <View style={styles.row}>
          {options.map((o) => (
            <Chip key={o.key} label={o.label} on={stat === o.key} onPress={() => setStat(o.key)} />
          ))}
        </View>
        <Text style={type.small}>{ui().shareSheet.routeIsOffUnlessYou}</Text>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Button title={ui().shareSheet.notNow} variant="secondary" onPress={onClose} style={{ flex: 0, paddingHorizontal: 22 }} />
          <Button title={busy ? ui().shareSheet.oneMoment : ui().shareSheet.share} onPress={onShare} disabled={busy} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Modal>
  );
}

function EnergyFaces({ before, after, u }: { before: Mood; after: Mood; u: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * u }}>
      <Face level={before} size={72 * u} ink={colors.ink} />
      <Text style={{ fontFamily: fonts.displayLight, fontSize: 44 * u, color: colors.ink }}>→</Text>
      <Face level={after} size={72 * u} ink={colors.ink} />
    </View>
  );
}

function Chip({ label, on, onPress, strong }: { label: string; on?: boolean; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, strong && styles.chipStrong, pressed && { opacity: 0.85 }]}
    >
      <Text style={[styles.chipText, (on || strong) && { color: strong ? colors.cream : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  sheet: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, alignItems: 'stretch' },
  lede: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  card: { alignSelf: 'center', overflow: 'hidden' },
  stat: { fontFamily: fonts.display, color: colors.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  sub: { fontFamily: fonts.bodySemi, color: colors.inkSoft, textTransform: 'uppercase', opacity: 0.8 },
  line: { fontFamily: fonts.displayItalic, color: colors.ink },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontFamily: fonts.bodySemi, color: colors.inkSoft, textTransform: 'uppercase', opacity: 0.75 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.lilac },
  chipStrong: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted },
}));
