import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import { formatDistance, formatDuration, formatElevation } from '../geo';
import { bests, EFFORTS, formatClock, trends, type Best, type Trends } from '../progress';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { useUnlocked } from '../unlockState';
import { loadYou } from '../you';
import { LockRow } from './LockRow';
import { Group as Fold, Legend } from './DeepCharts';
import { spokenPaceSec } from '../a11y';
import { live, ui } from '../i18n/ui';
import { decimal } from '../i18n/lang';

// The parts of the Me tab built from every run's facts: your bests and how
// you're doing against your own last six weeks. Nobody else is on this screen,
// and nothing here is ever sent anywhere.

const DAY = 86400000;
const LABEL: Record<string, string> = live(() => ({ ...Object.fromEntries(EFFORTS.map((e) => [e.key, e.label])), longest: ui().youSection.longest, climb: ui().youSection.mostClimb }));

export type YouData = { all: Best[]; recent: Best[]; tr: Trends };

/** Bests and trends from the facts kept for every run, read again when runs change. */
export function useYouData(refreshKey: number): YouData | null {
  const [data, setData] = useState<YouData | null>(null);
  useEffect(() => {
    let live = true;
    loadYou()
      .then(({ facts }) => {
        if (!live) return;
        if (facts.length === 0) return setData(null);
        const now = Date.now();
        setData({ all: bests(facts), recent: bests(facts, now - 90 * DAY), tr: trends(facts, now) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return data;
}

/** Your bests as a row of chips, the newest marked, then the bests curve folded away. Free. */
export function BestsRow({ data, km }: { data: YouData; km: boolean }) {
  const { all, recent } = data;
  const now = Date.now();
  const value = (b: Best) => (b.key === 'longest' ? formatDistance(b.value, km) : b.key === 'climb' ? formatElevation(b.value, km) : formatClock(b.value));
  return (
    <View style={{ gap: spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {all.map((b) => {
          const fresh = now - b.at < 14 * DAY;
          const r = recent.find((x) => x.key === b.key);
          const lately = r && r.runId !== b.runId ? ui().youSection.lately(value(r)) : null;
          return (
            <View key={b.key} style={[styles.best, fresh && { backgroundColor: colors.mint }]}>
              <Text style={styles.bestValue}>{value(b)}</Text>
              <Text style={styles.bestLabel}>{LABEL[b.key]}{fresh ? ui().youSection.new : ''}</Text>
              {lately && <Text style={styles.bestLately}>{lately}</Text>}
            </View>
          );
        })}
      </ScrollView>
      <BestsCurve all={all} recent={recent} km={km} />
    </View>
  );
}

/**
 * Fitness, usual pace and rhythm against your own last weeks. These read
 * months of runs, so they come with the unlock ("Trends over months"); locked,
 * only the lock row shows. Null when unlocked and there is nothing to say yet.
 */
export function Lately({ data, km, unlocked }: { data: YouData; km: boolean; unlocked: boolean }) {
  const { tr } = data;
  const unit = km ? 'km' : 'mi';
  const perUnit = (s: number) => formatClock(km ? s : s * 1.609344);
  const rows: Array<{ k: string; v: string; spark?: React.ReactNode }> = [];
  if (unlocked && tr.fitness) {
    const f = tr.fitness;
    const diff = f.before != null ? f.before - f.now : null;
    rows.push({
      k: ui().youSection.fitnessEstimate,
      v:
        ui().youSection.n5KmInAboutX(formatClock(f.now)) +
        (diff == null ? ui().youSection.yourBaselineIsStillForming : diff >= 5 ? ui().youSection.xQuickerThanTheSix(formatClock(diff)) : diff <= -5 ? ui().youSection.aLittleSlowerThanThe : ui().youSection.holdingSteady),
      spark: <Line values={tr.fitness.series.map((x) => -x)} color={colors.mintDeep} />,
    });
  }
  if (unlocked && tr.pace) {
    const p = tr.pace;
    const diff = p.before != null ? p.before - p.now : null;
    const per = km ? 1 : 1.609344;
    rows.push({
      k: ui().youSection.usualPace,
      v:
        `${perUnit(p.now)} /${unit}` +
        (diff == null ? '.' : diff >= 3 ? ui().youSection.xSQuickerThanSix(Math.round(diff * per)) : diff <= -3 ? ui().youSection.xSSlowerThanSix(Math.round(-diff * per)) : ui().youSection.sameAsSixWeeksAgo),
      spark: <Line values={p.series.map((x) => -x)} color={colors.peachDeep} />,
    });
  }
  const weeks = tr.rhythm.filter(Boolean).length;
  if (unlocked) rows.push({ k: ui().youSection.rhythm, v: ui().youSection.ranInXOfThe(weeks), spark: <Dots values={tr.rhythm} color={colors.skyDeep} /> });
  if (!unlocked) return <LockRow title={ui().youSection.trendsOverMonths} detail={ui().youSection.fitnessUsualPaceAndRhythm} />;
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.k} style={[styles.trend, i > 0 && styles.trendLine]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.trendK}>{r.k}</Text>
            <Text style={styles.trendV}>{r.v}</Text>
          </View>
          {r.spark ? <View style={{ width: 76, alignItems: 'flex-end' }}>{r.spark}</View> : null}
        </View>
      ))}
      <Text style={[type.small, { marginTop: spacing.sm }]}>{ui().youSection.onlyEverComparedWithYour}</Text>
    </View>
  );
}

/** "On average a run moves your energy +0.6 faces. Evenings lift you most." Free; null with too few answers. */
export function rechargeLine(tr: Trends): string | null {
  const r = tr.recharge;
  if (!r) return null;
  const faces = Math.abs(r.avg) < 0.05 ? ui().youSection.noChange : ui().youSection.faces(`${r.avg > 0 ? '+' : ''}${decimal(r.avg.toFixed(1))}`);
  return ui().youSection.onAverageARunMoves(faces) + (r.best ? ui().youSection.liftYouMost(r.best) : '');
}

/** "This week" against your usual week, from the same facts. */
export function weekLine(tr: Trends): string | null {
  const w = tr.week;
  if (w.usual == null || w.usual <= 0) return null;
  const big = w.now > w.usual * 1.3;
  return ui().youSection.yourUsualIsX(formatDuration(Math.round(w.usual))).trim() + (big ? ui().youSection.aBigWeekAnEasy : '');
}

function scale(values: number[], h: number): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v) => h - 3 - ((v - min) / span) * (h - 6));
}

/**
 * Higher is better: callers flip values that improve by going down. The soft
 * band behind the line is "your usual": the range of the first half of the
 * line, so the latest point reads against your own baseline.
 */
function Line({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const ys = scale(values, 30);
  const step = 70 / (values.length - 1);
  const pts = ys.map((y, i) => `${3 + i * step},${y}`).join(' ');
  const base = ys.slice(0, Math.max(2, Math.floor(ys.length / 2)));
  const top = Math.min(...base);
  const bottom = Math.max(...base);
  return (
    <Svg width={76} height={30}>
      <Rect x={0} y={top - 2} width={76} height={Math.max(4, bottom - top + 4)} rx={3} fill={colors.lilacSoft} />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={3 + (values.length - 1) * step} cy={ys[ys.length - 1]} r={3} fill={color} />
    </Svg>
  );
}

function Bars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <Svg width={76} height={30}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 26);
        return <Rect key={i} x={2 + i * 12.4} y={28 - h} width={8} height={h} rx={2} fill={color} opacity={i === values.length - 1 ? 0.55 : 1} />;
      })}
    </Svg>
  );
}

function Dots({ values, color }: { values: boolean[]; color: string }) {
  return (
    <Svg width={76} height={30}>
      {values.map((on, i) => (
        <Circle key={i} cx={4 + i * 6.2} cy={15} r={2.5} fill={color} opacity={on ? 1 : 0.22} />
      ))}
    </Svg>
  );
}

// ---- Bests as one curve (V3) --------------------------------------------------------
// Best pace for each distance, all time and the last 90 days, on a log scale of
// distance. Folded away until opened, so the Me tab stays calm.

function BestsCurve({ all, recent, km }: { all: Best[]; recent: Best[]; km: boolean }) {
  const [w, setW] = useState(0);
  const pts = EFFORTS.map((e) => {
    const a = all.find((b) => b.key === e.key);
    const r = recent.find((b) => b.key === e.key);
    return a ? { key: e.key, label: e.label, m: e.m, pace: a.value / (e.m / 1000), recent: r ? r.value / (e.m / 1000) : null } : null;
  }).filter((p): p is NonNullable<typeof p> => p != null);
  if (pts.length < 3) return null;
  const m = ui().deepMore;
  const unit = km ? 'km' : 'mi';
  const pace = (s: number) => formatClock(km ? s : s * 1.609344);
  const h = 120;
  const lx = (d: number) => Math.log(d);
  const x0 = lx(pts[0].m);
  const x1 = lx(pts[pts.length - 1].m);
  const x = (d: number) => 16 + ((lx(d) - x0) / (x1 - x0 || 1)) * (w - 32);
  const vals = pts.flatMap((p) => [p.pace, p.recent]).filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 5;
  const y = (v: number) => 8 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (h - 16); // quicker (lower s/km) is higher
  const line = (vs: Array<[number, number]>) => vs.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const rec = pts.filter((p) => p.recent != null);
  const head = pts.find((p) => p.key === '5k') ?? pts[pts.length - 1];
  const spoken = [m.curveTitle, ...pts.map((p) => m.curveSpoken(p.label, spokenPaceSec(p.pace, km), p.recent != null ? spokenPaceSec(p.recent, km) : null))].join('. ');
  return (
    <Fold id="bests-curve" title={m.curveTitle} headline={m.curveHeadline(head.label, pace(head.pace), unit)}>
      <View accessible accessibilityLabel={spoken} style={{ gap: 6 }}>
        <View style={{ height: h }} onLayout={(e) => setW(e.nativeEvent.layout.width)} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {w > 0 && (
            <Svg width={w} height={h}>
              <Path d={line(pts.map((p) => [x(p.m), y(p.pace)]))} stroke={colors.text} strokeWidth={2} fill="none" strokeLinejoin="round" />
              {rec.length > 1 && <Path d={line(rec.map((p) => [x(p.m), y(p.recent!)]))} stroke={colors.chartQuick} strokeWidth={2} fill="none" strokeLinejoin="round" />}
              {pts.map((p) => (
                <Circle key={p.key} cx={x(p.m)} cy={y(p.pace)} r={4} fill={colors.text} stroke={colors.white} strokeWidth={1.5} />
              ))}
              {rec.map((p) => (
                <Circle key={`r-${p.key}`} cx={x(p.m)} cy={y(p.recent!)} r={4} fill={colors.chartQuick} stroke={colors.white} strokeWidth={1.5} />
              ))}
            </Svg>
          )}
        </View>
        <View style={{ height: 14 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {w > 0 &&
            pts.map((p) => (
              <Text key={p.key} style={[styles.curveTick, { left: x(p.m) - 24 }]}>
                {p.label}
              </Text>
            ))}
        </View>
        <Legend items={[{ c: colors.text, t: m.allTime }, { c: colors.chartQuick, t: m.last90 }]} />
        <Text style={type.small}>{m.curveDetail}</Text>
      </View>
    </Fold>
  );
}

const styles = themedStyles(() => ({
  best: { backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, minWidth: 96 },
  bestValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text, fontVariant: ['tabular-nums'] },
  bestLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  bestLately: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  trendLine: { borderTopWidth: 1, borderTopColor: colors.line },
  trendK: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  curveTick: { position: 'absolute', width: 48, textAlign: 'center', fontFamily: fonts.body, fontSize: 10, color: colors.muted },
  trendV: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21, color: colors.text },
}));
