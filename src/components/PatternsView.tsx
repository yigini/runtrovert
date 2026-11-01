import React from 'react';
import { Text, View } from 'react-native';
import type { Change, Insight, Patterns } from '../patterns';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { useUnlocked } from '../unlockState';
import { LockGlyph, LockRow } from './LockRow';
import { ui } from '../i18n/ui';
import { dateLocale, decimal } from '../i18n/lang';

/**
 * Your runs › Patterns: your own before and after energy answers, counted.
 * The first one is free; the ones that read months of runs come with
 * Everything, once. No score, no advice, every line shows its counts.
 */
export function PatternsView({ patterns }: { patterns: Patterns | null }) {
  const unlocked = useUnlocked();
  if (!patterns) return null;
  const { first, more } = patterns;
  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.hero} accessible accessibilityLabel={`${first.line} ${first.detail}`}>
        <Text style={[type.eyebrow, { color: colors.lilacDeep }]}>{ui().patternsView.whatYouToldTheApp}</Text>
        <Text style={styles.heroLine}>{first.line}</Text>
        {first.changes ? <Dots changes={first.changes} /> : null}
        <Text style={[type.small, { color: colors.lilacDeep }]}>{first.detail}</Text>
      </View>

      {unlocked ? (
        <>
          <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">{ui().patternsView.morePatterns}</Text>
          {more.map((i) => (
            <InsightCard key={i.key} insight={i} />
          ))}
        </>
      ) : (
        <>
          <Text style={[type.eyebrow, { marginTop: spacing.sm }]} accessibilityRole="header">{ui().patternsView.morePatternsOnceThereS}</Text>
          <View>
            {more.map((i) => (
              <View key={i.key} style={styles.locked} accessible accessibilityLabel={ui().patternsView.locked(i.title)}>
                <LockGlyph size={16} />
                <Text style={styles.lockedText}>{i.title}</Text>
              </View>
            ))}
          </View>
          <LockRow title={ui().patternsView.theseReadMonthsOfRuns} detail={ui().patternsView.theyComeWithEverythingOnce} />
        </>
      )}
      <Text style={type.small}>{ui().patternsView.countedOnThisPhoneFrom}</Text>
    </View>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const label = [insight.title, insight.line, ...(insight.rows ?? []).map((r) => `${r.label}: ${r.value}`), insight.detail].join('. ');
  return (
    <View style={styles.card} accessible accessibilityLabel={label}>
      <Text style={type.eyebrow}>{insight.title}</Text>
      <Text style={[styles.cardLine, !insight.ready && { color: colors.muted }]}>{insight.line}</Text>
      {insight.rows?.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={styles.rowValue}>{r.value}</Text>
        </View>
      ))}
      <Text style={type.small}>{insight.detail}</Text>
    </View>
  );
}

const GLYPH: Record<Change, string> = { up: '↑', same: '=', down: '↓' };

function Dots({ changes }: { changes: Change[] }) {
  return (
    <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {changes.map((c, i) => (
        <View key={i} style={[styles.dot, c === 'up' ? styles.up : c === 'same' ? styles.same : styles.down]}>
          <Text style={[styles.dotText, c === 'up' && { color: colors.cream }]}>{GLYPH[c]}</Text>
        </View>
      ))}
    </View>
  );
}

/** How the screen writes dates and distances inside pattern lines. */
export function patternFormat(km: boolean) {
  return {
    date: (t: number) => new Date(t).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }),
    distance: (m: number) => (km ? `${decimal((m / 1000).toFixed(1))} km` : `${decimal((m / 1609.344).toFixed(1))} mi`),
  };
}

const styles = themedStyles(() => ({
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.lg, padding: 20, gap: 12 },
  heroLine: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  up: { backgroundColor: colors.lilacDeep },
  same: { backgroundColor: colors.lilac },
  down: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.ring },
  dotText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.lilacDeep },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  lockedText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, flex: 1 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, gap: 10 },
  cardLine: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, flexShrink: 1 },
  rowValue: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, flexShrink: 1, textAlign: 'right' },
}));
