import React, { useMemo, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { distanceUnit, estimateCalories, formatDistance, formatDistanceNumber, formatDuration, formatElevation, formatPace, MILE_M } from '../geo';
import { runStats, type RunStats as Stats, type SeriesPoint, type StatPoint, type StatRun, type Sun } from '../runStats';
import { clock } from '../sky';
import { colors, fonts, radius, spacing, type } from '../theme';
import { BUSY_LABEL } from '../places';
import { SplitsTable, type SplitRow } from './SplitsTable';
import { live, ui } from '../i18n/ui';

// The stats page for one run: the four numbers first, big and plain, then the
// run drawn out (pace and hills along the way, splits, halves, the sun), then a
// handful of odd little facts. Everything comes from the stored fixes.

const QUIET = BUSY_LABEL;
const MOOD: Record<number, string> = live(() => ui().common.mood);

export interface RunStatsProps {
  run: StatRun & { quiet?: 'crowded' | 'some' | 'empty' | null; moodBefore?: number | null; moodAfter?: number | null };
  points: StatPoint[];
  splits: SplitRow[];
  laps?: SplitRow[];
  partial?: SplitRow | null;
  sun?: Sun | null;
  km: boolean;
  /** The four big numbers. Off on the finish screen, where they sit over the map. */
  hero?: boolean;
}

export function RunStatsView({ run, points, splits, laps = [], partial, sun, km, hero = true }: RunStatsProps) {
  const stats = useMemo(
    () => runStats(run, points, splits.map((s) => (s.durationS / Math.max(s.distanceM, 1)) * 1000), sun ?? null),
    [run, points, splits, sun],
  );
  const [at, setAt] = useState<number | null>(null); // metres along the run, while a finger is on a chart
  const charted = stats.pace.length > 0;

  return (
    <View style={{ gap: spacing.md }}>
      {hero && <Hero run={run} km={km} />}
      {charted ? (
        <View style={styles.card}>
          <Readout stats={stats} at={at} km={km} />
          <SeriesChart series={stats.pace} kind="pace" stats={stats} at={at} onAt={setAt} km={km} />
          {stats.elevation.length > 0 && (
            <>
              <Text style={[styles.eyebrow, { marginTop: spacing.sm }]}>{ui().runStats.upAndDown}</Text>
              <SeriesChart series={stats.elevation} kind="elevation" stats={stats} at={at} onAt={setAt} km={km} />
            </>
          )}
          <DistanceAxis total={stats.pace[stats.pace.length - 1].d} km={km} />
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.lilacSoft }]}>
          <Text style={styles.emptyTitle}>{ui().runStats.tooShortToDraw}</Text>
          <Text style={type.small}>{ui().runStats.chartsStartAfterAbout400}</Text>
        </View>
      )}
      <SplitsTable title={ui().runStats.splitsPerX(distanceUnit(km))} rows={splits} km={km} partial={partial} />
      {laps.length > 0 && <SplitsTable title={ui().runStats.laps} rows={laps} km={km} />}
      {stats.halves && <HalvesBar halves={stats.halves} />}
      {stats.light && <DayArc light={stats.light} />}
      <Facts run={run} stats={stats} km={km} />
    </View>
  );
}

// ---- The four numbers ---------------------------------------------------------------

function Hero({ run, km }: { run: StatRun; km: boolean }) {
  return (
    <View style={styles.hero}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Text style={styles.heroBig}>{run.distanceM < 1000 && km ? Math.round(run.distanceM) : formatDistanceNumber(run.distanceM, km)}</Text>
        <Text style={styles.heroUnit}>{run.distanceM < 1000 && km ? 'm' : distanceUnit(km)}</Text>
      </View>
      <View style={styles.heroRow}>
        <HeroStat value={formatDuration(run.durationS)} label={ui().runStats.time} tone={colors.mint} />
        <HeroStat value={formatPace(run.distanceM, run.durationS, km)} label={ui().runStats.paceX(distanceUnit(km))} tone={colors.peach} />
        <HeroStat value={formatElevation(run.elevationGainM, km)} label={ui().runStats.climb} tone={colors.sky} />
      </View>
    </View>
  );
}

function HeroStat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={[styles.heroTick, { backgroundColor: tone }]} />
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

// ---- Pace and hills along the run -----------------------------------------------------

function nearest(series: SeriesPoint[], d: number): SeriesPoint {
  let best = series[0];
  for (const p of series) if (Math.abs(p.d - d) < Math.abs(best.d - d)) best = p;
  return best;
}

function paceText(sPerKm: number, km: boolean): string {
  const s = km ? sPerKm : (sPerKm * MILE_M) / 1000;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
}

function Readout({ stats, at, km }: { stats: Stats; at: number | null; km: boolean }) {
  const unit = distanceUnit(km);
  if (at == null) {
    return (
      <View style={styles.readout}>
        <Text style={styles.eyebrow}>{ui().runStats.paceAlongTheWay}</Text>
        <Text style={type.small}>{stats.fastest ? ui().runStats.quickestStretchXXHold(paceText(stats.fastest.pace, km), unit) : ui().runStats.holdAFingerOnIt}</Text>
      </View>
    );
  }
  const p = nearest(stats.pace, at);
  const e = stats.elevation.length ? nearest(stats.elevation, at) : null;
  const up = e && stats.lowM != null ? e.v - stats.lowM : null;
  return (
    <View style={styles.readout}>
      <Text style={styles.eyebrow}>{ui().runStats.atX(formatDistance(p.d, km))}</Text>
      <Text style={styles.readoutValue}>
        {paceText(p.v, km)} /{unit}
        {up != null ? ui().runStats.xAboveTheLowestPoint(formatElevation(up, km)) : ''}
      </Text>
    </View>
  );
}

const CHART_H = { pace: 120, elevation: 72 };

function SeriesChart({ series, kind, stats, at, onAt, km }: { series: SeriesPoint[]; kind: 'pace' | 'elevation'; stats: Stats; at: number | null; onAt: (d: number | null) => void; km: boolean }) {
  const [w, setW] = useState(0);
  const h = CHART_H[kind];
  const total = series[series.length - 1].d || 1;
  const pad = 6;

  // Pace: faster is up, and very slow moments (lights, a walk) are clamped so they don't flatten the rest.
  const vals = series.map((p) => p.v);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (kind === 'pace') {
    const sorted = [...vals].sort((a, b) => a - b);
    hi = Math.min(hi, sorted[Math.floor(sorted.length / 2)] * 1.45);
  }
  const span = Math.max(hi - lo, kind === 'pace' ? 20 : 8);
  const mid = (hi + lo) / 2;
  lo = mid - span / 2;
  hi = mid + span / 2;
  const x = (d: number) => (d / total) * w;
  const y = (v: number) => {
    const f = (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo);
    return kind === 'pace' ? pad + f * (h - 2 * pad) : h - pad - f * (h - 2 * pad);
  };

  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(total).toFixed(1)},${h} L0,${h} Z`;
  const stroke = kind === 'pace' ? colors.peachDeep : colors.skyDeep;
  const fill = kind === 'pace' ? colors.peach : colors.sky;

  const touch = (e: GestureResponderEvent) => {
    if (w > 0) onAt(Math.max(0, Math.min(total, (e.nativeEvent.locationX / w) * total)));
  };

  const avgY = kind === 'pace' && stats.avgPace != null ? y(stats.avgPace) : null;
  const fast = kind === 'pace' && stats.fastest ? { cx: x(stats.fastest.d), cy: y(stats.fastest.pace) } : null;
  const cursor = at != null ? nearest(series, at) : null;

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: h }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={touch}
      onResponderMove={touch}
      onResponderRelease={() => onAt(null)}
      onResponderTerminate={() => onAt(null)}
      accessible
      accessibilityLabel={
        kind === 'pace'
          ? ui().runStats.paceAlongTheRunAverage(stats.avgPace ? paceText(stats.avgPace, km) : ui().runStats.unknown, distanceUnit(km))
          : ui().runStats.elevationAlongTheRunFrom(formatElevation(stats.lowM ?? 0, km), formatElevation(stats.highM ?? 0, km))
      }
    >
      {w > 0 && (
        <Svg width={w} height={h}>
          <Path d={area} fill={fill} opacity={kind === 'pace' ? 0.45 : 0.6} />
          {avgY != null && <Line x1={0} x2={w} y1={avgY} y2={avgY} stroke={colors.inkMuted} strokeWidth={1} strokeDasharray="4 5" opacity={0.6} />}
          <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {fast && cursor == null && <Circle cx={fast.cx} cy={fast.cy} r={5} fill={stroke} stroke={colors.white} strokeWidth={2} />}
          {cursor && (
            <>
              <Line x1={x(cursor.d)} x2={x(cursor.d)} y1={0} y2={h} stroke={colors.ink} strokeWidth={1} opacity={0.35} />
              <Circle cx={x(cursor.d)} cy={y(cursor.v)} r={5} fill={stroke} stroke={colors.white} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}
      {kind === 'pace' && avgY != null && w > 0 && (
        <Text style={[styles.axisNote, { top: Math.max(0, Math.min(h - 16, avgY - 16)), right: 0 }]}>{ui().runStats.avgX(paceText(stats.avgPace!, km))}</Text>
      )}
      {kind === 'elevation' && stats.highM != null && stats.lowM != null && (
        <Text style={[styles.axisNote, { top: 0, right: 0 }]}>{Math.round(stats.highM - stats.lowM) <= 3 ? ui().runStats.flatAsATable : ui().runStats.xTopToBottom(formatElevation(stats.highM - stats.lowM, km))}</Text>
      )}
    </View>
  );
}

function DistanceAxis({ total, km }: { total: number; km: boolean }) {
  const unit = km ? 1000 : MILE_M;
  const n = total / unit;
  const every = n <= 6 ? 1 : n <= 12 ? 2 : n <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let k = every; k * unit < total * 0.97; k += every) ticks.push(k);
  return (
    <View style={{ height: 14 }}>
      {ticks.map((k) => (
        <Text key={k} style={[styles.tick, { left: `${((k * unit) / total) * 100}%` }]}>
          {k}
        </Text>
      ))}
      <Text style={[styles.tick, { right: 0 }]}>{distanceUnit(km)}</Text>
    </View>
  );
}

// ---- First half, second half ------------------------------------------------------------

function HalvesBar({ halves }: { halves: NonNullable<Stats['halves']> }) {
  const { firstS, secondS } = halves;
  const max = Math.max(firstS, secondS);
  const diff = secondS - firstS;
  const pct = Math.abs(diff) / Math.max(firstS, 1);
  const verdict =
    pct < 0.02 ? ui().runStats.evenHalvesVeryComposed : diff < 0 ? ui().runStats.negativeSplitXQuickerOn(formatDuration(-diff)) : ui().runStats.secondHalfXSlowerThe(formatDuration(diff));
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{ui().runStats.halves}</Text>
      {[
        { label: ui().runStats.firstHalf, s: firstS, tone: colors.lilac },
        { label: ui().runStats.secondHalf, s: secondS, tone: diff < 0 && pct >= 0.02 ? colors.mint : colors.lilac },
      ].map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={styles.rowValue}>{formatDuration(r.s)}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(r.s / max) * 100}%`, backgroundColor: r.tone }]} />
          </View>
        </View>
      ))}
      <Text style={type.small}>{verdict}</Text>
    </View>
  );
}

// ---- The sun -------------------------------------------------------------------------

function DayArc({ light }: { light: NonNullable<Stats['light']> }) {
  const [w, setW] = useState(0);
  const h = 100;
  const { sunrise, sunset, start, end, darkS } = light;
  const day = sunset - sunrise;
  const night = 86400000 - day;
  const cx = w / 2;
  const rx = Math.max(0, w / 2 - 28);
  const ry = 62;
  const horizon = 74;
  // Day runs over the top of the arc, sunrise left to sunset right; night is a shallow dip underneath.
  const point = (t: number) => {
    if (t >= sunrise && t <= sunset) {
      const a = Math.PI * (1 - (t - sunrise) / day);
      return { x: cx + rx * Math.cos(a), y: horizon - ry * Math.sin(a) };
    }
    const since = t > sunset ? t - sunset : t - (sunset - 86400000);
    const a = Math.PI * (since / night);
    return { x: cx + rx * Math.cos(a), y: horizon + 14 * Math.sin(a) };
  };
  const steps = 24;
  const runPath = Array.from({ length: steps + 1 }, (_, i) => point(start + ((end - start) * i) / steps))
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const trace = (from: number, span: number) =>
    Array.from({ length: 41 }, (_, i) => point(from + (span * i) / 40))
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  const arc = trace(sunrise, day);
  const dip = trace(sunset + 1, night - 2);
  const endP = point(end);
  const dark = end < sunrise || end > sunset;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{ui().runStats.theLight}</Text>
      <View style={{ height: h }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Line x1={0} x2={w} y1={horizon} y2={horizon} stroke={colors.inkMuted} strokeWidth={1} opacity={0.25} />
            <Path d={dip} stroke={colors.lilac} strokeWidth={2} fill="none" strokeDasharray="2 5" strokeLinecap="round" />
            <Path d={arc} stroke={colors.butter} strokeWidth={2} fill="none" strokeDasharray="2 5" strokeLinecap="round" />
            <Path d={runPath} stroke={dark ? colors.lilacDeep : colors.butterDeep} strokeWidth={6} fill="none" strokeLinecap="round" />
            <Circle cx={endP.x} cy={endP.y} r={8} fill={dark ? colors.lilac : colors.butter} stroke={colors.white} strokeWidth={2} />
          </Svg>
        )}
        <Text style={[styles.tick, { left: 0, top: h - 14 }]}>↑ {clock(sunrise)}</Text>
        <Text style={[styles.tick, { right: 0, top: h - 14 }]}>{clock(sunset)} ↓</Text>
      </View>
      <Text style={styles.sunLine}>{light.line}</Text>
      {darkS >= 60 && end - start > 0 && <Text style={type.small}>{ui().runStats.xMinOfItUnder(Math.round(darkS / 60))}</Text>}
    </View>
  );
}

// ---- Odd little facts ------------------------------------------------------------------

function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function Facts({ run, stats, km }: { run: RunStatsProps['run']; stats: Stats; km: boolean }) {
  const unit = distanceUnit(km);
  const tiles: Array<{ value: string; label: string; tone: string; deep: string }> = [];
  const add = (value: string, label: string, tone: string, deep: string) => tiles.push({ value, label, tone, deep });

  if (stats.steadiness) add(stats.steadiness.word, ui().runStats.paceWithinXSMost(stats.steadiness.spread), colors.lilacSoft, colors.lilacDeep);
  if (stats.fastest) add(`${paceText(stats.fastest.pace, km)} /${unit}`, ui().runStats.yourQuickest200MAround(formatDistance(stats.fastest.d, km)), colors.peach, colors.peachDeep);
  if (stats.light && stats.light.darkS >= 60) add(ui().common.min(Math.round(stats.light.darkS / 60)), ui().runStats.underStreetlights, colors.butter, colors.butterDeep);
  if (stats.steps) add(`≈ ${thousands(stats.steps)}`, ui().runStats.stepsRoughly, colors.mintSoft, colors.mintDeep);
  if (stats.floors) add(String(stats.floors), ui().runStats.floorsOfStairsInClimbing, colors.sky, colors.skyDeep);
  if (stats.highM != null && stats.lowM != null && stats.highM - stats.lowM > 3) add(formatElevation(stats.highM - stats.lowM, km), ui().runStats.fromTheLowestPointTo, colors.sky, colors.skyDeep);
  if (stats.corners != null && stats.corners > 0) add(String(stats.corners), stats.corners === 1 ? ui().runStats.cornerTaken : ui().runStats.cornersTaken, colors.mintSoft, colors.mintDeep);
  if (stats.furthestM) add(formatDistance(stats.furthestM, km), ui().runStats.furthestFromTheStartAs, colors.lilacSoft, colors.lilacDeep);
  if (stats.loopM != null) add(formatDistance(stats.loopM, km), ui().runStats.fromWhereYouBeganA, colors.mintSoft, colors.mintDeep);
  if (stats.stoppedS) add(formatDuration(stats.stoppedS), ui().runStats.standingStillLightsLacesA, colors.butter, colors.butterDeep);
  if (run.quiet) add(QUIET[run.quiet], ui().runStats.howBusyItWasOut, colors.lilacSoft, colors.lilacDeep);
  if (run.moodBefore && run.moodAfter) add(`${MOOD[run.moodBefore]} → ${MOOD[run.moodAfter]}`, ui().runStats.yourEnergyBeforeAndAfter, colors.lilac, colors.lilacDeep);
  if (run.distanceM >= 200) add(`${estimateCalories(run.distanceM)} kcal`, ui().runStats.burnedARoughEstimate, colors.peach, colors.peachDeep);

  if (!tiles.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.eyebrow, { marginTop: spacing.sm }]}>{ui().runStats.thingsNobodyElseWouldTell}</Text>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, { backgroundColor: t.tone }]}>
            <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
              {t.value}
            </Text>
            <Text style={[styles.tileLabel, { color: t.deep }]}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 10 },
  eyebrow: { ...type.eyebrow, letterSpacing: 1.5 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkMuted },

  hero: { paddingVertical: spacing.sm, gap: spacing.md },
  heroBig: { fontFamily: fonts.displayLight, fontSize: 88, lineHeight: 90, letterSpacing: -4, color: colors.text, fontVariant: ['tabular-nums'] },
  heroUnit: { fontFamily: fonts.bodySemi, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: colors.inkMuted, marginBottom: 14 },
  heroRow: { flexDirection: 'row', gap: spacing.md },
  heroTick: { width: 24, height: 4, borderRadius: 2 },
  heroValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },

  readout: { gap: 2, minHeight: 44 },
  readoutValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  axisNote: { position: 'absolute', fontFamily: fonts.bodySemi, fontSize: 10, color: colors.inkMuted, backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 4, borderRadius: 4 },
  tick: { position: 'absolute', fontFamily: fonts.body, fontSize: 10, color: colors.muted, fontVariant: ['tabular-nums'] },

  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  rowValue: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.cream, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },

  sunLine: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.text },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '47%', flexGrow: 1, borderRadius: radius.md, padding: spacing.md, gap: 4, minHeight: 104, justifyContent: 'flex-end' },
  tileValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: fonts.body, fontSize: 13, lineHeight: 17 },
});
