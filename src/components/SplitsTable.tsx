import React from 'react';
import { Text, View } from 'react-native';
import { formatDistance, formatDuration, formatPace, MILE_M } from '../geo';
import { spokenPace } from '../a11y';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { ui } from '../i18n/ui';

export interface SplitRow {
  index: number;
  distanceM: number;
  durationS: number;
}

/**
 * Splits as bars around your average for the run: left of the line was quicker,
 * right was slower, the longer the bar the bigger the difference. Blue and
 * orange are the deep-stats pair; the quickest and slowest are in bold.
 */
export function SplitsTable({ title, rows, km, partial }: { title: string; rows: SplitRow[]; km: boolean; partial?: SplitRow | null }) {
  if (rows.length === 0 && !partial) return null;
  const all: Array<SplitRow & { partial: boolean }> = rows.map((r) => ({ ...r, partial: false }));
  if (partial && partial.distanceM > 20) all.push({ ...partial, partial: true });
  const paces = all.map((r) => (r.durationS / Math.max(r.distanceM, 1)) * 1000); // s/km
  const full = paces.filter((_, i) => !all[i].partial);
  const avg = full.length ? full.reduce((a, b) => a + b, 0) / full.length : paces[0];
  const spread = Math.max(5, ...paces.map((p) => Math.abs(p - avg)));
  const quickest = rows.length > 1 ? Math.min(...full) : null;
  const slowest = rows.length > 1 ? Math.max(...full) : null;
  const perUnit = km ? 1 : MILE_M / 1000;
  const m = ui().deepMore;

  return (
    <View style={styles.wrap}>
      <Text style={[type.eyebrow, { letterSpacing: 1.5 }]}>{title}</Text>
      <View style={{ gap: 4 }}>
        {all.map((r, i) => {
          const p = paces[i];
          const dev = p - avg;
          const share = Math.min(1, Math.abs(dev) / spread) * 50;
          const strong = !r.partial && (p === quickest || p === slowest);
          const diffS = Math.round(Math.abs(dev) * perUnit);
          const spokenDiff = diffS < 1 ? '' : dev < 0 ? m.quickerBy(diffS) : m.slowerBy(diffS);
          return (
            <View
              key={`${r.index}-${r.partial}`}
              style={[styles.row, r.partial && { opacity: 0.55 }]}
              accessible
              accessibilityLabel={m.splitSpoken(r.index, spokenPace(r.distanceM, r.durationS, km), spokenDiff).replace(/, $/, '')}
            >
              <Text style={styles.idx}>{r.partial ? formatDistance(r.distanceM, km) : String(r.index)}</Text>
              <Text style={[styles.pace, strong && { fontFamily: fonts.bodyBold }]}>{formatPace(r.distanceM, r.durationS, km)}</Text>
              <View style={styles.barArea}>
                <View style={styles.mid} />
                {share > 0.5 ? (
                  <View
                    style={[
                      styles.bar,
                      dev < 0 ? { right: '50%', width: `${share}%`, backgroundColor: colors.chartQuick } : { left: '50%', width: `${share}%`, backgroundColor: colors.chartSlow },
                    ]}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.key} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.keyItem}>
          <View style={[styles.swatch, { backgroundColor: colors.chartQuick }]} />
          <Text style={styles.keyText}>{m.splitsQuicker}</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={[styles.swatch, { backgroundColor: colors.chartSlow }]} />
          <Text style={styles.keyText}>{m.splitsSlower}</Text>
        </View>
        <Text style={styles.keyText}>{m.splitsAverage(paceOf(avg, km))}</Text>
      </View>
      <Text style={type.small}>{ui().splitsTable.total(formatDuration(rows.reduce((a, r) => a + r.durationS, 0)), rows.length, km)}</Text>
    </View>
  );
}

function paceOf(sPerKm: number, km: boolean): string {
  const s = km ? sPerKm : (sPerKm * MILE_M) / 1000;
  const mm = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r === 60 ? `${mm + 1}:00` : `${mm}:${String(r).padStart(2, '0')}`;
}

const styles = themedStyles(() => ({
  wrap: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 22 },
  idx: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, width: 52, fontVariant: ['tabular-nums'] },
  pace: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, width: 44, fontVariant: ['tabular-nums'] },
  barArea: { flex: 1, height: 14, justifyContent: 'center' },
  mid: { position: 'absolute', left: '50%', top: -4, bottom: -4, width: 1, backgroundColor: colors.ring },
  bar: { position: 'absolute', top: 1, height: 12, borderRadius: 4 },
  key: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  keyText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
}));
