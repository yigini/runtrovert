import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDistance, formatDuration, formatPace } from '../geo';
import { colors, fonts, radius, spacing, type } from '../theme';
import { ui } from '../i18n/ui';

export interface SplitRow {
  index: number;
  distanceM: number;
  durationS: number;
}

/** Splits as a small bar chart: shorter bar = faster. Fastest in mint. */
export function SplitsTable({ title, rows, km, partial }: { title: string; rows: SplitRow[]; km: boolean; partial?: SplitRow | null }) {
  if (rows.length === 0 && !partial) return null;
  const all: Array<SplitRow & { partial: boolean }> = rows.map((r) => ({ ...r, partial: false }));
  if (partial && partial.distanceM > 20) all.push({ ...partial, partial: true });
  const paces = all.map((r) => r.durationS / Math.max(r.distanceM, 1));
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const fastest = rows.length > 1 ? min : null;

  return (
    <View style={styles.wrap}>
      <Text style={[type.eyebrow, { letterSpacing: 1.5 }]}>{title}</Text>
      <View style={styles.bars}>
        {all.map((r, i) => {
          const p = paces[i];
          const h = max === min ? 36 : 24 + ((p - min) / (max - min)) * 28; // 24–52 px
          const isFastest = fastest != null && Math.abs(p - fastest) < 1e-9 && !r.partial;
          return (
            <View key={r.index} style={[styles.col, r.partial && { opacity: 0.55 }]}>
              <View style={[styles.bar, { height: h, backgroundColor: isFastest ? colors.mint : colors.lilac }]} />
              <Text style={[styles.pace, isFastest && { color: colors.mintDeep, fontFamily: fonts.bodyBold }]}>{formatPace(r.distanceM, r.durationS, km)}</Text>
              <Text style={styles.idx}>{r.partial ? formatDistance(r.distanceM, km) : String(r.index)}</Text>
            </View>
          );
        })}
      </View>
      <Text style={type.small}>{ui().splitsTable.total(formatDuration(rows.reduce((a, r) => a + r.durationS, 0)), rows.length, km)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  pace: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'] },
  idx: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },
});
