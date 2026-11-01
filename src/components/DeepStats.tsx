import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { distanceUnit, formatDistance, formatDuration, MILE_M } from '../geo';
import { deepMonths, deepRun, type Bucket, type DeepMonths, type DeepRun, type Group } from '../deepStats';
import { loadDeepFacts } from '../deepStore';
import { deepLong, EFFORTS, LENGTHS, type DeepLong, type MonthRange } from '../deepLong';
import { LightChart, liftText as LiftText, LoopStrip, monthName, MonthRangeChart, RangeBar, StreetsChart, SweetGrid } from './DeepLongCharts';
import type { HeartSample } from '../heart';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type, themedStyles, themed } from '../theme';
import { useUnlocked } from '../unlockState';
import { LockGlyph, LockRow } from './LockRow';
import { ui } from '../i18n/ui';
import { DISPLAY_MAX_SCALE, spokenBpm, spokenDistance, spokenDuration, spokenPaceSec } from '../a11y';
import { deepMore, moving, type CornersCost, type DeepMore, type MorePoint } from '../deepMore';
import { CornersShape, GpsStrip, Group as Fold, HeartPathChart, HillChart, LagChart, Legend, StopsChart, TurnChart, ZonesBar } from './DeepCharts';
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

export function DeepRunView({ points, kmPaces, heart, maxHr, km, climbM = 0 }: { points: MorePoint[]; kmPaces: number[]; heart: HeartSample[]; maxHr: number | null; km: boolean; climbM?: number }) {
  const open = useSettings().settings.deepStats;
  const deep = useMemo(() => (open ? deepRun({ points, kmPaces, heart, maxHr }) : null), [open, points, kmPaces, heart, maxHr]);
  const more = useMemo(() => (open ? deepMore(points, heart, climbM) : null), [open, points, heart, climbM]);
  const totalM = useMemo(() => (open && points.length > 1 ? moving(points).d.slice(-1)[0] : 0), [open, points]);
  return (
    <View style={{ gap: spacing.md }}>
      <DeepToggle />
      {deep && more ? <RunCards deep={deep} more={more} km={km} hasHeart={heart.length > 0} totalM={totalM} /> : null}
    </View>
  );
}

// Five folding groups, closed until opened, each with a one-line headline so the
// closed list already says something. A group only shows when it has something.
function RunCards({ deep, more, km, hasHeart, totalM }: { deep: DeepRun; more: DeepMore; km: boolean; hasHeart: boolean; totalM: number }) {
  const s = ui().deepStats;
  const m = ui().deepMore;
  const unit = distanceUnit(km);
  const perUnit = (x: number) => decimal(String(Math.round((km ? x : x * (MILE_M / 1000)) * 10) / 10));
  const hasPace = deep.wobble || deep.shape || deep.steady || more.turn;
  const hasHills = deep.grade || more.hill;
  const hasStops = more.stops || more.corners;
  const hasHeartGroup = deep.drift || deep.zones || more.lag || more.heartPath;
  const any = hasPace || hasHills || hasStops || hasHeartGroup || more.gps;
  const turn = more.turn;
  const hill = more.hill;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.eyebrow} accessibilityRole="header">{s.theDeepEnd}</Text>
      {!any ? <Text style={type.small}>{s.nothingYet}</Text> : null}
      {hasPace ? (
        <Fold
          id="pace"
          title={m.groups.pace}
          headline={turn ? (turn.kind === 'faded' ? m.turnHeadlineFaded(formatDistance(turn.atM, km)) : m.turnHeadlineHeld) : deep.shape ? s.shapeWord[deep.shape.kind] : null}
        >
          {turn ? (
            <ChartCard
              title={m.turn}
              line={turn.kind === 'faded' ? `${m.turnFaded(paceText(turn.holdPace, km), unit, formatDistance(turn.atM, km))} ${m.turnFadedEnd(paceText(turn.endPace, km), unit)}` : m.turnHeld(paceText(turn.pace, km), unit)}
              spoken={turn.kind === 'faded' ? m.turnFadedSpoken(spokenPaceSec(turn.holdPace, km), spokenDistance(turn.atM, km), spokenPaceSec(turn.endPace, km)) : m.turnHeldSpoken(spokenPaceSec(turn.pace, km))}
              detail={m.quickerIsHigher}
            >
              <TurnChart turn={turn} />
            </ChartCard>
          ) : null}
          {deep.shape ? (
            <Card title={s.shape} value={s.shapeWord[deep.shape.kind]} line={{ even: s.shapeEven, negative: s.shapeNegative(pct(deep.shape.diffPct)), faded: s.shapeFaded(pct(deep.shape.diffPct)), lateKick: s.shapeLateKick, wandering: s.shapeWandering }[deep.shape.kind]} />
          ) : null}
          {deep.wobble ? <Card title={s.wobble} value={s.wobbleValue(pct(deep.wobble.pct))} line={s.wobbleDetail(deep.wobble.quickest, deep.wobble.slowest, unit)} /> : null}
          {deep.steady ? (
            <Card
              title={s.steady}
              value={formatDistance(deep.steady.m, km)}
              line={s.steadyDetail(paceText(deep.steady.pace, km), unit, formatDistance(deep.steady.fromM, km))}
              spoken={[s.steady, spokenDistance(deep.steady.m, km), s.steadySpoken(spokenPaceSec(deep.steady.pace, km), spokenDistance(deep.steady.fromM, km))].join('. ')}
            />
          ) : null}
        </Fold>
      ) : null}
      {hasHills ? (
        <Fold id="hills" title={m.groups.hills} headline={hill?.upS != null ? m.hillHeadline(perUnit(hill.upS), unit) : hill?.downS != null ? m.hillHeadlineDown(perUnit(hill.downS), unit) : null}>
          {hill ? (
            <ChartCard title={m.hill} line={[hill.upS != null ? m.hillUp(perUnit(hill.upS), unit) : null, hill.downS != null ? m.hillDown(perUnit(hill.downS), unit) : null].filter(Boolean).join(' ')} detail={m.hillDetail}>
              <HillChart hill={hill} />
              <Legend items={[{ c: colors.chartSlow, t: s.uphill }, { c: colors.chartQuick, t: s.downhill }]} />
            </ChartCard>
          ) : null}
          {deep.grade ? (
            <Card title={s.grade} detail={s.gradeDetail}>
              <GradeRow label={s.uphill} b={deep.grade.up} km={km} />
              <GradeRow label={s.flat} b={deep.grade.flat} km={km} />
              <GradeRow label={s.downhill} b={deep.grade.down} km={km} />
            </Card>
          ) : null}
        </Fold>
      ) : null}
      {hasStops ? (
        <Fold
          id="stops"
          title={m.groups.stops}
          headline={[more.stops ? m.stopsHeadline(formatDuration(more.stops.standS + more.stops.restartS)) : null, more.corners ? m.cornersHeadline(more.corners.corners.length) : null].filter(Boolean).join(' · ')}
        >
          {more.stops ? (
            <ChartCard
              title={m.stops}
              line={m.stopsLine(more.stops.stops.length, formatDuration(more.stops.standS + more.stops.restartS), formatDuration(more.stops.restartS))}
              spoken={m.stopsLine(more.stops.stops.length, spokenDuration(more.stops.standS + more.stops.restartS), spokenDuration(more.stops.restartS))}
            >
              <StopsChart stops={more.stops} totalM={totalM} />
            </ChartCard>
          ) : null}
          {more.corners ? (
            <ChartCard title={m.corners} line={cornerLine(more.corners, km)} detail={m.cornersDetail}>
              <CornersShape corners={more.corners} />
            </ChartCard>
          ) : null}
        </Fold>
      ) : null}
      {hasHeartGroup ? (
        <Fold id="heart" title={m.groups.heart} headline={[deep.drift ? s.driftWord(deep.drift.pct) : null, more.lag ? m.lagHeadline(more.lag.lagS) : null].filter(Boolean).join(' · ')}>
          {deep.drift ? (
            <ChartCard
              title={s.drift}
              value={`${deep.drift.pct < 0 ? '−' : ''}${pct(deep.drift.pct)}%`}
              line={`${s.driftWord(deep.drift.pct)}. ${s.driftDetail(deep.drift.firstBpm, deep.drift.secondBpm)}`}
              spoken={[s.drift, `${deep.drift.pct < 0 ? '−' : ''}${pct(deep.drift.pct)}%`, s.driftWord(deep.drift.pct), s.driftSpoken(spokenBpm(deep.drift.firstBpm), spokenBpm(deep.drift.secondBpm))].join('. ')}
            />
          ) : null}
          {more.heartPath ? (
            <ChartCard
              title={m.path}
              detail={m.pathDetail}
              spoken={m.pathSpoken(pathPoint(more.heartPath[0], km), pathPoint(more.heartPath[more.heartPath.length - 1], km))}
            >
              <HeartPathChart path={more.heartPath} />
            </ChartCard>
          ) : null}
          {deep.zones ? <Zones zones={deep.zones} /> : null}
          {more.lag ? (
            <ChartCard title={m.lag} line={m.lagLine(more.lag.lagS)} detail={m.lagDetail}>
              <LagChart lag={more.lag} />
            </ChartCard>
          ) : null}
        </Fold>
      ) : null}
      {more.gps ? (
        <Fold id="gps" title={m.groups.gps} headline={m.gpsHeadline(Math.round(more.gps.share.good * 100))}>
          <ChartCard
            title={m.gps}
            line={[m.gpsLine(Math.round(more.gps.share.good * 100)), more.gps.gapM >= 50 ? m.gpsGap(formatDistance(more.gps.gapM, km)) : null].filter(Boolean).join(' ')}
            detail={m.gpsDetail}
          >
            <GpsStrip gps={more.gps} />
          </ChartCard>
        </Fold>
      ) : null}
      {any && !hasHeart ? <Text style={type.small}>{s.needsAWatch}</Text> : null}
      <Text style={type.small}>{s.workedOutOnThisPhone}</Text>
    </View>
  );
}

function pathPoint(p: { pace: number; bpm: number }, km: boolean): string {
  return `${spokenPaceSec(p.pace, km)}, ${spokenBpm(p.bpm)}`;
}

function cornerLine(c: CornersCost, km: boolean): string {
  const m = ui().deepMore;
  const worst = c.corners.reduce((a, b) => (b.costS > a.costS ? b : a));
  return `${m.cornersLine(c.corners.length, formatDuration(c.totalS))} ${m.cornersWorst(m.seconds(decimal(worst.costS.toFixed(1))), formatDistance(worst.atM, km))}`;
}

/** A card whose chart is hidden from screen readers and said in words instead. */
function ChartCard({ title, value, line, detail, spoken, children }: { title: string; value?: string; line?: string; detail?: string; spoken?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.card} accessible accessibilityLabel={spoken ? [title, spoken, detail].filter(Boolean).join('. ') : [title, value, line, detail].filter(Boolean).join('. ')}>
      <Text style={styles.cardTitle}>{title}</Text>
      {value ? <Text style={styles.value} maxFontSizeMultiplier={DISPLAY_MAX_SCALE}>{value}</Text> : null}
      {line ? <Text style={styles.cardLine}>{line}</Text> : null}
      {children}
      {detail ? <Text style={type.small}>{detail}</Text> : null}
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
  const parts = zones.seconds.map((sec, i) => `${s.zoneNames[i]} ${ui().common.min(Math.round(sec / 60))}`).join(', ');
  return (
    <View style={styles.card} accessible accessibilityLabel={`${ui().deepMore.zonesBarSpoken(parts)} ${s.zonesSpoken(spokenBpm(zones.maxHr))}`}>
      <Text style={styles.cardTitle}>{s.zones}</Text>
      <ZonesBar seconds={zones.seconds} tones={ZONE_TONES} names={s.zoneNames} />
      <Text style={type.small}>{s.zonesDetail(zones.maxHr)}</Text>
    </View>
  );
}

// ---- Across months (the unlock) ------------------------------------------------------------

export function DeepMonthsView({ km, refreshKey }: { km: boolean; refreshKey?: number }) {
  const open = useSettings().settings.deepStats;
  const unlocked = useUnlocked();
  const [deep, setDeep] = useState<{ months: DeepMonths; long: DeepLong } | null>(null);
  useEffect(() => {
    if (!open || !unlocked) return;
    let live = true;
    loadDeepFacts()
      .then(({ facts, places, long, loops }) => live && setDeep({ months: deepMonths(facts, places), long: deepLong(long, loops) }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, unlocked, refreshKey]);
  const s = ui().deepStats;
  const L = ui().deepLong;
  return (
    <View style={{ gap: spacing.md }}>
      <DeepToggle />
      {open && !unlocked ? (
        <>
          <View>
            {[L.groups.change, L.groups.when, L.groups.suits].map((t) => (
              <View key={t} style={styles.locked} accessible accessibilityLabel={ui().patternsView.locked(t)}>
                <LockGlyph size={16} />
                <Text style={styles.lockedText}>{t}</Text>
              </View>
            ))}
          </View>
          <LockRow title={s.acrossMonthsLocked} />
        </>
      ) : null}
      {open && unlocked && deep ? <MonthCards deep={deep.months} long={deep.long} km={km} /> : null}
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

// Three folding groups, closed until opened: how you're changing, when and
// where you run, and what suits you. Each shows only when it has something.
function MonthCards({ deep, long, km }: { deep: DeepMonths; long: DeepLong; km: boolean }) {
  const s = ui().deepStats;
  const L = ui().deepLong;
  const unit = distanceUnit(km);
  const perUnit = (x: number) => decimal(String(Math.round((km ? x : x * (MILE_M / 1000)) * 10) / 10));
  const heatLabel: Record<string, string> = {
    cold: s.under(temp(8, km)),
    mild: s.between(temp(8, km), temp(18, km)),
    warm: s.between(temp(18, km), temp(25, km)),
    hot: s.andOver(temp(25, km)),
  };
  const windLabel: Record<string, string> = { calm: s.under(windText(20, km)), windy: s.andOver(windText(20, km)) };
  const wobbled = deep.wobble.filter((w) => w.pct != null).length >= 2;
  const month = monthName;
  const changing = long.durability || long.hills || wobbled || deep.firstLast;
  const when = deep.year.days > 0 || long.light || long.streets || long.loops.length || deep.places.length;
  const suits = long.sweet || deep.dayPart.length || deep.recovery.length || deep.heat.length || deep.wind.length;
  const any = changing || when || suits;
  const hours = decimal((deep.year.minutes / 60).toFixed(deep.year.minutes >= 600 ? 0 : 1));
  const firstShown = (ms: MonthRange[]) => ms.find((m) => m.mid != null)!;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.eyebrow} accessibilityRole="header">{s.acrossMonths}</Text>
      <Text style={type.small}>{any ? s.acrossMonthsIntro : s.nothingAcrossMonths}</Text>
      {changing ? (
        <Fold id="m-change" title={L.groups.change} headline={long.durability ? L.durabilityHeadline(formatDistance(long.durability.last, km)) : null}>
          {long.durability ? (
            <ChartCard
              title={L.durability}
              line={L.durabilityLine(month(firstShown(long.durability.months).month), formatDistance(long.durability.first, km), formatDistance(long.durability.last, km))}
              spoken={[
                L.durabilityLine(month(firstShown(long.durability.months).month), spokenDistance(long.durability.first, km), spokenDistance(long.durability.last, km)),
                ...long.durability.months.filter((m) => m.mid != null).map((m) => L.monthSpoken(month(m.month), spokenDistance(m.mid!, km), m.n)),
              ].join('. ')}
              detail={L.durabilityDetail}
            >
              <MonthRangeChart months={long.durability.months} better="up" />
            </ChartCard>
          ) : null}
          {long.hills ? (
            <ChartCard
              title={L.hills}
              line={L.hillsLine(month(firstShown(long.hills.months).month), perUnit(long.hills.first), perUnit(long.hills.last), unit)}
              detail={L.hillsDetail}
            >
              <MonthRangeChart months={long.hills.months} better="down" />
            </ChartCard>
          ) : null}
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
        </Fold>
      ) : null}
      {when ? (
        <Fold id="m-when" title={L.groups.when} headline={deep.year.days > 0 ? s.yearDetail(deep.year.days, hours) : null}>
          {deep.year.days > 0 ? <Year year={deep.year} /> : null}
          {long.light ? (
            <ChartCard title={L.light} line={L.lightLine(long.light.inLight, long.light.inDark)} detail={L.lightDetail}>
              <LightChart light={long.light} />
            </ChartCard>
          ) : null}
          {long.streets && long.streets.best ? (
            <ChartCard
              title={L.streets}
              line={L.streetsLine(month(long.streets.best.month), Math.round(long.streets.best.share * 100))}
              spoken={[
                L.streetsLine(month(long.streets.best.month), Math.round(long.streets.best.share * 100)),
                ...long.streets.months.filter((m) => m.newM + m.knownM > 0).map((m) => L.streetsSpoken(month(m.month), spokenDistance(m.newM, km), spokenDistance(m.knownM, km))),
              ].join('. ')}
              detail={L.streetsDetail}
            >
              <StreetsChart streets={long.streets} />
            </ChartCard>
          ) : null}
          {long.loops.map((lp) => {
            const shown = lp.months.filter((m) => m.mid != null);
            return (
              <ChartCard key={lp.placeId} title={L.loop(lp.name)} line={L.loopLine(month(shown[0].month), formatDuration(lp.firstSpread), formatDuration(lp.lastSpread))} detail={L.loopDetail}>
                <LoopStrip loop={lp} />
              </ChartCard>
            );
          })}
          {deep.places.map((p) => (
            <RangeCard key={p.placeId} title={`${s.places} · ${p.name}`} km={km} rows={p.quarters.map((q) => ({ key: String(q.q), label: s.quarters[q.q], n: q.n, pace: q.pace, lo: q.lo, hi: q.hi }))} />
          ))}
        </Fold>
      ) : null}
      {suits ? (
        <Fold
          id="m-suits"
          title={L.groups.suits}
          headline={long.sweet?.best ? L.sweetHeadline(L.lengths[long.sweet.best.length], L.efforts[long.sweet.best.effort]) : null}
        >
          {long.sweet ? (
            <ChartCard
              title={L.sweet}
              line={long.sweet.best ? L.sweetLine(L.lengthsIn[long.sweet.best.length], L.effortsIn[long.sweet.best.effort], LiftText(long.sweet.best.lift)) : L.sweetNone}
              spoken={[
                long.sweet.best ? L.sweetLine(L.lengthsIn[long.sweet.best.length], L.effortsIn[long.sweet.best.effort], LiftText(long.sweet.best.lift)) : L.sweetNone,
                ...LENGTHS.flatMap((l) =>
                  EFFORTS.filter((e) => long.sweet!.cells[l][e].lift != null).map((e) => L.sweetCellSpoken(L.lengths[l], L.efforts[e], LiftText(long.sweet!.cells[l][e].lift!), long.sweet!.cells[l][e].n)),
                ),
              ].join('. ')}
              detail={L.sweetDetail(long.sweet.n)}
            >
              <SweetGrid sweet={long.sweet} />
            </ChartCard>
          ) : null}
          {deep.dayPart.length ? (
            <RangeCard title={s.dayPart} detail={s.paceNote} km={km} rows={deep.dayPart.map((g) => ({ ...g, label: s.dayPartName[g.key], extra: [g.distanceM != null ? formatDistance(g.distanceM, km) : null, liftText(g.lift)] }))} />
          ) : null}
          {deep.recovery.length ? (
            <RangeCard title={s.recovery} detail={s.paceNote} km={km} rows={deep.recovery.map((g) => ({ ...g, label: s.recoveryName[g.key], extra: [liftText(g.lift)] }))} />
          ) : null}
          {deep.heat.length ? <RangeCard title={s.heat} km={km} rows={deep.heat.map((g) => ({ ...g, label: heatLabel[g.key] }))} /> : null}
          {deep.wind.length ? <RangeCard title={s.wind} km={km} rows={deep.wind.map((g) => ({ ...g, label: windLabel[g.key] }))} /> : null}
        </Fold>
      ) : null}
    </View>
  );
}

/** Groups as rows with a dot for the middle run and a bar for where most runs fall, on one scale per card (V5). */
function RangeCard({ title, detail, km, rows }: { title: string; detail?: string; km: boolean; rows: Array<Group & { label: string; extra?: Array<string | null> }> }) {
  const vals = rows.flatMap((r) => [r.pace, r.lo, r.hi]).filter((v): v is number => v != null);
  const min = Math.min(...vals) - 3;
  const max = Math.max(...vals) + 3;
  return (
    <Card title={title} detail={detail}>
      {rows.map((g) => (
        <View key={g.key}>
          <GroupRow label={g.label} g={g} km={km} extra={g.extra} />
          <RangeBar pace={g.pace} lo={g.lo} hi={g.hi} min={min} max={max} />
        </View>
      ))}
    </Card>
  );
}

function GroupRow({ label, g, km, extra = [] }: { label: string; g: Group; km: boolean; extra?: Array<string | null> }) {
  const value = [g.pace != null ? `${paceText(g.pace, km)} /${distanceUnit(km)}` : null, ...extra].filter(Boolean).join(' · ');
  const runs = ui().deepStats.runsN(g.n);
  const said = [g.pace != null ? spokenPaceSec(g.pace, km) : null, ...extra].filter(Boolean).join(', ');
  const spread = g.lo != null && g.hi != null ? ui().deepLong.rangeSpoken(label, said, spokenPaceSec(g.lo, km), spokenPaceSec(g.hi, km), runs) : `${label}, ${runs}: ${said}`;
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={spread}>
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
  cardLine: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
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
