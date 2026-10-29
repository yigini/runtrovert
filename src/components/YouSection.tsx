import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { formatDistance, formatDuration, formatElevation } from '../geo';
import { bests, EFFORTS, formatClock, trends, type Best, type Trends } from '../progress';
import { colors, fonts, radius, spacing, type } from '../theme';
import { useUnlocked } from '../unlockState';
import { loadYou } from '../you';
import { LockRow } from './LockRow';

// The top of History: your bests and how you're doing against your own last
// six weeks. Nobody else is on this screen, and nothing here is ever sent anywhere.

const DAY = 86400000;
const LABEL: Record<string, string> = { ...Object.fromEntries(EFFORTS.map((e) => [e.key, e.label])), longest: 'Longest', climb: 'Most climb' };

export function YouSection({ km, refreshKey }: { km: boolean; refreshKey: number }) {
  const [data, setData] = useState<{ all: Best[]; recent: Best[]; tr: Trends } | null>(null);
  // Bests, this week and recharge are free; the six-week and twelve-week trends come with the unlock.
  const unlocked = useUnlocked();
  useEffect(() => {
    let live = true;
    loadYou()
      .then(({ facts }) => {
        if (!live || facts.length === 0) return;
        const now = Date.now();
        setData({ all: bests(facts), recent: bests(facts, now - 90 * DAY), tr: trends(facts, now) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (!data) return null;
  const { all, recent, tr } = data;
  const now = Date.now();
  const unit = km ? 'km' : 'mi';
  const perUnit = (s: number) => formatClock(km ? s : s * 1.609344);

  const value = (b: Best) => (b.key === 'longest' ? formatDistance(b.value, km) : b.key === 'climb' ? formatElevation(b.value, km) : formatClock(b.value));

  const rows: Array<{ k: string; v: string; spark?: React.ReactNode }> = [];
  if (unlocked && tr.fitness) {
    const f = tr.fitness;
    const diff = f.before != null ? f.before - f.now : null;
    rows.push({
      k: 'Fitness estimate',
      v:
        `5 km in about ${formatClock(f.now)}. ` +
        (diff == null ? 'Your baseline is still forming.' : diff >= 5 ? `${formatClock(diff)} quicker than the six weeks before.` : diff <= -5 ? 'A little slower than the six weeks before. Weeks, not days.' : 'Holding steady.'),
      spark: <Line values={tr.fitness.series.map((x) => -x)} color={colors.mintDeep} />,
    });
  }
  if (unlocked && tr.pace) {
    const p = tr.pace;
    const diff = p.before != null ? p.before - p.now : null;
    const per = km ? 1 : 1.609344;
    rows.push({
      k: 'Usual pace',
      v:
        `${perUnit(p.now)} /${unit}` +
        (diff == null ? '.' : diff >= 3 ? `, ${Math.round(diff * per)} s quicker than six weeks ago.` : diff <= -3 ? `, ${Math.round(-diff * per)} s slower than six weeks ago.` : ', same as six weeks ago.'),
      spark: <Line values={p.series.map((x) => -x)} color={colors.peachDeep} />,
    });
  }
  {
    const w = tr.week;
    const big = w.usual != null && w.usual > 0 && w.now > w.usual * 1.3;
    rows.push({
      k: 'This week',
      v: `${w.now > 0 ? formatDuration(w.now) : 'Nothing yet'}.` + (w.usual != null && w.usual > 0 ? ` Your usual is ${formatDuration(Math.round(w.usual))}.` : '') + (big ? ' A big week; an easy one next?' : ''),
      spark: <Bars values={w.bars} color={colors.butterDeep} />,
    });
  }
  if (tr.recharge) {
    const r = tr.recharge;
    const faces = Math.abs(r.avg) < 0.05 ? 'no change' : `${r.avg > 0 ? '+' : ''}${r.avg.toFixed(1)} faces`;
    rows.push({
      k: 'Recharge',
      v: `On average a run moves your energy ${faces}.` + (r.best ? ` ${r.best === 'morning' ? 'Mornings' : r.best === 'midday' ? 'Middays' : 'Evenings'} lift you most.` : ''),
    });
  }
  const weeks = tr.rhythm.filter(Boolean).length;
  if (unlocked) rows.push({ k: 'Rhythm', v: `Ran in ${weeks} of the last 12 weeks.`, spark: <Dots values={tr.rhythm} color={colors.skyDeep} /> });

  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <Text style={type.eyebrow}>You vs you</Text>
        <Text style={type.h2}>Only one name on this board.</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {all.map((b) => {
          const fresh = now - b.at < 14 * DAY;
          const r = recent.find((x) => x.key === b.key);
          const lately = r && r.runId !== b.runId ? `${value(r)} lately` : null;
          return (
            <View key={b.key} style={[styles.best, fresh && { backgroundColor: colors.mint }]}>
              <Text style={styles.bestValue}>{value(b)}</Text>
              <Text style={styles.bestLabel}>{LABEL[b.key]}{fresh ? ' · new' : ''}</Text>
              {lately && <Text style={styles.bestLately}>{lately}</Text>}
            </View>
          );
        })}
      </ScrollView>
      <View>
        {rows.map((r) => (
          <View key={r.k} style={styles.trend}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.trendK}>{r.k}</Text>
              <Text style={styles.trendV}>{r.v}</Text>
            </View>
            {r.spark ? <View style={{ width: 76, alignItems: 'flex-end' }}>{r.spark}</View> : null}
          </View>
        ))}
      </View>
      <LockRow title="Trends over months" detail="Fitness, usual pace and rhythm. Comes with Everything, once" />
      <Text style={type.small}>Only ever compared with your own runs. The 5 km estimate uses Riegel’s formula on your best efforts over 3 km; pace is a six-week median with hills allowed for.</Text>
      <Text style={[type.eyebrow, { marginTop: spacing.sm }]}>Every run</Text>
    </View>
  );
}

function scale(values: number[], h: number): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v) => h - 3 - ((v - min) / span) * (h - 6));
}

/** Higher is better: callers flip values that improve by going down. */
function Line({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const ys = scale(values, 30);
  const step = 70 / (values.length - 1);
  const pts = ys.map((y, i) => `${3 + i * step},${y}`).join(' ');
  return (
    <Svg width={76} height={30}>
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

const styles = StyleSheet.create({
  best: { backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, minWidth: 96 },
  bestValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.text, fontVariant: ['tabular-nums'] },
  bestLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  bestLately: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, marginTop: 2 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  trendK: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  trendV: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21, color: colors.text },
});
