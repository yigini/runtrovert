import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { distanceUnit, formatDistance, MILE_M } from '../geo';
import { deepMonths, deepRun, type Bucket, type DeepMonths, type DeepRun, type Group } from '../deepStats';
import { loadDeepFacts } from '../deepStore';
import type { HeartSample } from '../heart';
import type { StatPoint } from '../runStats';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type, themedStyles, themed } from '../theme';
import { useUnlocked } from '../unlockState';
import { LockGlyph, LockRow } from './LockRow';
import { ui } from '../i18n/ui';
import { DISPLAY_MAX_SCALE, spokenBpm, spokenDistance, spokenPaceSec } from '../a11y';
import { dateLocale, decimal } from '../i18n/lang';

// "Show me everything": the deep stats, closed by default so the run page and
// Patterns stay calm. Once opened they stay open (settings.deepStats) until the
// runner closes them. One run is free; months of runs come with Everything, once.
// Screen readers hear every number as words ("5 minutes 32 seconds per
// kilometre", not "5:32 /km"), and every chart has the same facts in text.

function paceText(sPerKm: number, km: boolean): string {
  const s = km ? sPerKm : (sPerKm * MILE_M) / 1000;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
}

const pct = (n: number) => decimal(Math.abs(n).toFixed(1).replace(/\.0$/, ''));

/** The quiet link that opens and closes the deep stats. */
export function DeepToggle() {
  const { settings, update } = useSettings();
  const open = settings.deepStats;
  return (
    <Pressable
      onPress={() => update({ deepStats: !open })}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? undefined : ui().deepStats.showMeEverythingHint}
      hitSlop={8}
      style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.toggleText}>{open ? ui().deepStats.showLess : ui().deepStats.showMeEverything}</Text>
    </Pressable>
  );
}

// ---- One run (free) --------------------------------------------------------------------

export function DeepRunView({ points, kmPaces, heart, maxHr, km }: { points: StatPoint[]; kmPaces: number[]; heart: HeartSample[]; maxHr: number | null; km: boolean }) {
  const open = useSettings().settings.deepStats;
  const deep = useMemo(() => (open ? deepRun({ points, kmPaces, heart, maxHr }) : null), [open, points, kmPaces, heart, maxHr]);
  return (
    <View style={{ gap: spacing.md }}>
      <DeepToggle />
      {deep ? <RunCards deep={deep} km={km} hasHeart={heart.length > 0} /> : null}
    </View>
  );
}

function RunCards({ deep, km, hasHeart }: { deep: DeepRun; km: boolean; hasHeart: boolean }) {
  const s = ui().deepStats;
  const unit = distanceUnit(km);
  const any = deep.wobble || deep.shape || deep.steady || deep.grade || deep.drift || deep.zones;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.eyebrow} accessibilityRole="header">{s.theDeepEnd}</Text>
      {!any ? <Text style={type.small}>{s.nothingYet}</Text> : null}
      {deep.shape ? (
        <Card title={s.shape} value={s.shapeWord[deep.shape.kind]} line={{ even: s.shapeEven, negative: s.shapeNegative(pct(deep.shape.diffPct)), faded: s.shapeFaded(pct(deep.shape.diffPct)), lateKick: s.shapeLateKick, wandering: s.shapeWandering }[deep.shape.kind]} />
      ) : null}
      {deep.wobble ? (
        <Card title={s.wobble} value={s.wobbleValue(pct(deep.wobble.pct))} line={s.wobbleDetail(deep.wobble.quickest, deep.wobble.slowest, unit)} />
      ) : null}
      {deep.steady ? (
        <Card
          title={s.steady}
          value={formatDistance(deep.steady.m, km)}
          line={s.steadyDetail(paceText(deep.steady.pace, km), unit, formatDistance(deep.steady.fromM, km))}
          spoken={[s.steady, spokenDistance(deep.steady.m, km), s.steadySpoken(spokenPaceSec(deep.steady.pace, km), spokenDistance(deep.steady.fromM, km))].join('. ')}
        />
      ) : null}
      {deep.grade ? (
        <Card title={s.grade} detail={s.gradeDetail}>
          <GradeRow label={s.uphill} b={deep.grade.up} km={km} />
          <GradeRow label={s.flat} b={deep.grade.flat} km={km} />
          <GradeRow label={s.downhill} b={deep.grade.down} km={km} />
        </Card>
      ) : null}
      {deep.drift ? (
        <Card title={s.drift} value={`${deep.drift.pct < 0 ? '−' : ''}${pct(deep.drift.pct)}%`} tone={colors.lilacSoft} line={`${s.driftWord(deep.drift.pct)}. ${s.driftDetail(deep.drift.firstBpm, deep.drift.secondBpm)}`}
          spoken={[s.drift, `${deep.drift.pct < 0 ? '−' : ''}${pct(deep.drift.pct)}%`, s.driftWord(deep.drift.pct), s.driftSpoken(spokenBpm(deep.drift.firstBpm), spokenBpm(deep.drift.secondBpm))].join('. ')}
        />
      ) : null}
      {deep.zones ? <Zones zones={deep.zones} /> : null}
      {any && !hasHeart ? <Text style={type.small}>{s.needsAWatch}</Text> : null}
      <Text style={type.small}>{s.workedOutOnThisPhone}</Text>
    </View>
  );
}

/** A card with a title, maybe a big value and a line, then any rows. With no rows it reads as one. */
function Card({ title, value, line, detail, spoken, tone = colors.white, children }: { title: string; value?: string; line?: string; detail?: string; spoken?: string; tone?: string; children?: React.ReactNode }) {
  const rows = React.Children.count(children) > 0;
  return (
    <View style={[styles.card, { backgroundColor: tone }]} accessible={!rows} accessibilityLabel={rows ? undefined : spoken ?? [title, value, line, detail].filter(Boolean).join('. ')}>
      <Text style={styles.cardTitle} accessibilityRole={rows ? 'header' : undefined}>{title}</Text>
      {value ? <Text style={styles.value} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{value}</Text> : null}
      {line ? <Text style={type.small}>{line}</Text> : null}
      {children}
      {detail ? <Text style={type.small}>{detail}</Text> : null}
    </View>
  );
}

function GradeRow({ label, b, km }: { label: string; b: Bucket | null; km: boolean }) {
  if (!b) return null;
  const value = `${paceText(b.pace, km)} /${distanceUnit(km)} · ${formatDistance(b.m, km)}`;
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${spokenPaceSec(b.pace, km)}, ${spokenDistance(b.m, km)}`}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const ZONE_TONES = themed(() => [colors.zoneLow, colors.mintMark, colors.butterMark, colors.peachMark, colors.zoneHigh]);

function Zones({ zones }: { zones: NonNullable<DeepRun['zones']> }) {
  const s = ui().deepStats;
  const total = zones.seconds.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={[styles.card, { backgroundColor: colors.lilacSoft }]}>
      <Text style={styles.cardTitle} accessibilityRole="header">{s.zones}</Text>
      {zones.seconds.map((sec, i) => {
        const min = Math.round(sec / 60);
        return (
          <View key={i} style={{ gap: 4 }} accessible accessibilityLabel={`${s.zoneNames[i]}: ${ui().common.min(min)}`}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{s.zoneNames[i]}</Text>
              <Text style={styles.rowValue}>{ui().common.min(min)}</Text>
            </View>
            <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <View style={[styles.fill, { width: `${(sec / total) * 100}%`, backgroundColor: ZONE_TONES[i] }]} />
            </View>
          </View>
        );
      })}
      <Text style={type.small} accessibilityLabel={s.zonesSpoken(spokenBpm(zones.maxHr))}>{s.zonesDetail(zones.maxHr)}</Text>
    </View>
  );
}

// ---- Across months (the unlock) ------------------------------------------------------------

export function DeepMonthsView({ km, refreshKey }: { km: boolean; refreshKey?: number }) {
  const open = useSettings().settings.deepStats;
  const unlocked = useUnlocked();
  const [deep, setDeep] = useState<DeepMonths | null>(null);
  useEffect(() => {
    if (!open || !unlocked) return;
    let live = true;
    loadDeepFacts()
      .then(({ facts, places }) => live && setDeep(deepMonths(facts, places)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, unlocked, refreshKey]);
  const s = ui().deepStats;
  return (
    <View style={{ gap: spacing.md }}>
      <DeepToggle />
      {open && !unlocked ? (
        <>
          <View>
            {[s.monthWobble, s.heat, s.dayPart, s.recovery, s.places, s.year, s.firstLast(distanceUnit(km))].map((t) => (
              <View key={t} style={styles.locked} accessible accessibilityLabel={ui().patternsView.locked(t)}>
                <LockGlyph size={16} />
                <Text style={styles.lockedText}>{t}</Text>
              </View>
            ))}
          </View>
          <LockRow title={s.acrossMonthsLocked} />
        </>
      ) : null}
      {open && unlocked && deep ? <MonthCards deep={deep} km={km} /> : null}
    </View>
  );
}

function temp(c: number, km: boolean): string {
  return km ? `${c} °C` : `${Math.round((c * 9) / 5 + 32)} °F`;
}

function windText(kmh: number, km: boolean): string {
  return km ? `${kmh} km/h` : `${Math.round(kmh / 1.609)} mph`;
}

function liftText(lift: number | null | undefined): string | null {
  if (lift == null) return null;
  const r = Math.round(lift * 10) / 10;
  return ui().deepStats.energy(`${r > 0 ? '+' : r < 0 ? '−' : ''}${decimal(String(Math.abs(r)))}`);
}

function MonthCards({ deep, km }: { deep: DeepMonths; km: boolean }) {
  const s = ui().deepStats;
  const unit = distanceUnit(km);
  const heatLabel: Record<string, string> = {
    cold: s.under(temp(8, km)),
    mild: s.between(temp(8, km), temp(18, km)),
    warm: s.between(temp(18, km), temp(25, km)),
    hot: s.andOver(temp(25, km)),
  };
  const windLabel: Record<string, string> = { calm: s.under(windText(20, km)), windy: s.andOver(windText(20, km)) };
  const wobbled = deep.wobble.filter((w) => w.pct != null).length >= 2;
  const any = wobbled || deep.heat.length || deep.wind.length || deep.dayPart.length || deep.recovery.length || deep.places.length || deep.firstLast || deep.year.days > 0;
  const month = (t: number) => new Date(t).toLocaleDateString(dateLocale(), { month: 'short' });
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.eyebrow} accessibilityRole="header">{s.acrossMonths}</Text>
      <Text style={type.small}>{any ? s.acrossMonthsIntro : s.nothingAcrossMonths}</Text>
      {deep.year.days > 0 ? <Year year={deep.year} /> : null}
      {deep.firstLast ? (
        <Card
          title={s.firstLast(unit)}
          line={
            Math.abs(deep.firstLast.pct) < 1.5
              ? s.firstLastSame
              : deep.firstLast.pct < 0
                ? s.firstLastQuicker(pct(deep.firstLast.pct), unit)
                : s.firstLastSlower(pct(deep.firstLast.pct), unit)
          }
          detail={s.firstLastDetail(deep.firstLast.n)}
        />
      ) : null}
      {deep.dayPart.length ? (
        <Card title={s.dayPart} detail={s.paceNote}>
          {deep.dayPart.map((g) => (
            <GroupRow key={g.key} label={s.dayPartName[g.key]} g={g} km={km} extra={[g.distanceM != null ? formatDistance(g.distanceM, km) : null, liftText(g.lift)]} />
          ))}
        </Card>
      ) : null}
      {deep.recovery.length ? (
        <Card title={s.recovery} detail={s.paceNote}>
          {deep.recovery.map((g) => (
            <GroupRow key={g.key} label={s.recoveryName[g.key]} g={g} km={km} extra={[liftText(g.lift)]} />
          ))}
        </Card>
      ) : null}
      {deep.heat.length ? (
        <Card title={s.heat}>
          {deep.heat.map((g) => (
            <GroupRow key={g.key} label={heatLabel[g.key]} g={g} km={km} />
          ))}
        </Card>
      ) : null}
      {deep.wind.length ? (
        <Card title={s.wind}>
          {deep.wind.map((g) => (
            <GroupRow key={g.key} label={windLabel[g.key]} g={g} km={km} />
          ))}
        </Card>
      ) : null}
      {deep.places.map((p) => (
        <Card key={p.placeId} title={`${s.places} · ${p.name}`}>
          {p.quarters.map((q) => (
            <GroupRow key={q.q} label={s.quarters[q.q]} g={{ key: String(q.q), n: q.n, pace: q.pace }} km={km} />
          ))}
        </Card>
      ))}
      {wobbled ? (
        <Card title={s.monthWobble} detail={s.monthWobbleDetail}>
          {deep.wobble.map((w) => (
            <View key={w.month} style={styles.row} accessible accessibilityLabel={`${month(w.month)}: ${w.pct != null ? `±${pct(w.pct)}%` : '–'}`}>
              <Text style={styles.rowLabel}>{month(w.month)}</Text>
              <Text style={styles.rowValue}>{w.pct != null ? `±${pct(w.pct)}%` : '–'}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function GroupRow({ label, g, km, extra = [] }: { label: string; g: Group; km: boolean; extra?: Array<string | null> }) {
  const value = [g.pace != null ? `${paceText(g.pace, km)} /${distanceUnit(km)}` : null, ...extra].filter(Boolean).join(' · ');
  const runs = ui().deepStats.runsN(g.n);
  const said = [g.pace != null ? spokenPaceSec(g.pace, km) : null, ...extra].filter(Boolean).join(', ');
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`${label}, ${runs}: ${said}`}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Text style={styles.count}>{runs}</Text>
    </View>
  );
}

const CELL_GAP = 2;

function Year({ year }: { year: DeepMonths['year'] }) {
  const s = ui().deepStats;
  const [w, setW] = useState(0);
  const hours = decimal((year.minutes / 60).toFixed(year.minutes >= 600 ? 0 : 1));
  const cols = year.weeks.length;
  const cell = w > 0 ? (w - CELL_GAP * (cols - 1)) / cols : 0;
  const tone = yearTone;
  return (
    <View style={styles.card} accessible accessibilityLabel={s.yearSpoken(year.days, hours)}>
      <Text style={styles.cardTitle}>{s.year}</Text>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: cell > 0 ? cell * 7 + CELL_GAP * 6 : 70 }}>
        {cell > 0 ? (
          <Svg width={w} height={cell * 7 + CELL_GAP * 6}>
            {year.weeks.map((week, x) =>
              week.map((m, y) => <Rect key={`${x}-${y}`} x={x * (cell + CELL_GAP)} y={y * (cell + CELL_GAP)} width={cell} height={cell} rx={Math.min(2, cell / 3)} fill={tone(m)} />),
            )}
          </Svg>
        ) : null}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.count}>{s.less}</Text>
        {[0, 10, 30, 60].map((m) => (
          <View key={m} style={[styles.swatch, { backgroundColor: tone(m) }]} />
        ))}
        <Text style={styles.count}>{s.more}</Text>
      </View>
      <Text style={type.small}>{s.yearDetail(year.days, hours)}</Text>
    </View>
  );
}

// Four steps a phone in sunlight can still tell apart: no run, a short one, a
// middling one, a long one. The same facts are in the line under the grid.
function yearTone(m: number): string {
  return m <= 0 ? colors.cream : m < 25 ? colors.mint : m < 50 ? colors.yearMid : colors.mintDeep;
}

const styles = themedStyles(() => ({
  toggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  toggleText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkMuted, textDecorationLine: 'underline' },
  eyebrow: { ...type.eyebrow, letterSpacing: 1.5 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkMuted },
  value: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text, flexShrink: 1 },
  rowValue: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right' },
  count: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.white, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  lockedText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft },
}));
