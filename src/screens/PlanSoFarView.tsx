import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { LockRow } from '../components/LockRow';
import { colors, fonts, radius, spacing, type, themedStyles, themed } from '../theme';
import { GOAL_LABEL, type PlanSpec } from '../training/catalogue';
import { formatRaceTime, formatSPerKm, pacesFromRace } from '../training/paces';
import { PACES_STALE_WEEKS, refreshPaces, soFar, type Phase, type WeekSoFar } from '../training/overview';
import { loadHeart, saveHeart } from '../training/store';
import { maxFromAge, rangeFor, saneMax, saneRest, type HeartSetup } from '../training/zones';
import type { Plan } from '../training/types';
import { highestHeartRate } from '../db';
import { planWeekOpen } from '../unlock';
import { ui } from '../i18n/ui';
import { decimal } from '../i18n/lang';

const KM_IN_MI = 1.609344;
const RACES = [5, 10, 21.0975, 42.195];
const PHASE_FILL: Record<Phase, string> = themed(() => ({ base: colors.mint, build: colors.sky, peak: colors.butter, taper: colors.peach }));

/**
 * "Your plan so far": planned against done, week by week, the phases, the long
 * run, the load from the runner's own answers, and the paces with a way to
 * bring them up to date. Read-only apart from the paces.
 */
export function PlanSoFarView({ plan, spec, today, unitsKm, onBack, onCommit }: { plan: Plan; spec: PlanSpec; today: number; unitsKm: boolean; onBack: () => void; onCommit: (p: Plan, said: string) => void }) {
  const f = soFar(plan, today, (w) => planWeekOpen(plan, w.index));
  const byTime = spec.timeBased;
  const dist = (km: number) => (unitsKm ? `${decimal(km.toFixed(1))} km` : `${decimal((km / KM_IN_MI).toFixed(1))} mi`);
  const locked = plan.weeks.length - f.weeks.length;
  const loads = f.weeks.filter((w) => w.load != null);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <BackButton onPress={onBack} label={ui().train.thisWeek} />
      <Text style={type.eyebrow}>{plan.name}</Text>
      <Text style={styles.h1}>{ui().soFar.title}</Text>
      <Text style={styles.lede}>
        {f.due === 0 && f.done === 0
          ? ui().soFar.nothingYet
          : [ui().soFar.summary(f.done, f.due, f.skipped), f.hardDue ? ui().soFar.hard(f.hardDone, f.hardDue) : null, f.asPlanned ? ui().soFar.asPlanned(f.asPlanned) : null, byTime ? null : ui().soFar.distance(dist(f.kmDone), dist(f.kmDue))].filter(Boolean).join(' ')}
      </Text>

      <Block title={ui().soFar.phasesTitle}>
        <View style={styles.phaseRow}>
          {f.phases.map((p) => (
            <View key={p.from} style={[styles.phase, { flex: p.to - p.from + 1, backgroundColor: PHASE_FILL[p.phase] }, f.phaseNow === p.phase && styles.phaseNow]} accessibilityLabel={`${ui().soFar.phase[p.phase]}, ${ui().train.weekX(p.from)}–${p.to}`}>
              <Text style={styles.phaseText} numberOfLines={1}>
                {ui().soFar.phase[p.phase]}
              </Text>
            </View>
          ))}
        </View>
        {f.phaseNow && (
          <>
            <Text style={styles.bodyStrong}>{ui().soFar.nowX(ui().soFar.phase[f.phaseNow])}</Text>
            <Text style={styles.hint}>{ui().soFar.phaseHint[f.phaseNow]}</Text>
          </>
        )}
      </Block>

      <Block title={ui().soFar.weeksTitle}>
        <Bars weeks={f.weeks} planned={(w) => (byTime ? w.plannedMin : w.plannedKm)} done={(w) => (byTime ? w.doneMin : w.doneKm)} label={(w) => (byTime ? ui().common.min(w.doneMin) : dist(w.doneKm))} />
        <Text style={styles.hint}>{ui().soFar.weeksHint}</Text>
        {locked > 0 && <LockRow title={ui().soFar.moreWeeks(locked)} />}
      </Block>

      {!byTime && f.weeks.some((w) => w.longPlannedKm != null) && (
        <Block title={ui().soFar.longTitle}>
          <Bars weeks={f.weeks.filter((w) => w.longPlannedKm != null)} planned={(w) => w.longPlannedKm ?? 0} done={(w) => w.longDoneKm ?? 0} label={(w) => (w.longDoneKm != null ? dist(w.longDoneKm) : '')} />
          <Text style={styles.hint}>{f.firstLongKm != null && f.lastLongKm != null ? ui().soFar.longGrew(dist(f.firstLongKm), dist(f.lastLongKm)) : ui().soFar.longNone}</Text>
        </Block>
      )}

      <Block title={ui().soFar.loadTitle}>
        {loads.length ? (
          <>
            <Bars weeks={f.weeks} planned={(w) => w.load ?? 0} done={(w) => w.load ?? 0} label={(w) => (w.load != null ? String(w.load) : '')} tone={colors.lilacMark} />
            <Text style={styles.hint}>{ui().soFar.loadHint}</Text>
          </>
        ) : (
          <Text style={styles.hint}>{ui().soFar.loadNone}</Text>
        )}
      </Block>

      <PacesBlock plan={plan} spec={spec} today={today} unitsKm={unitsKm} pacesWeeks={f.pacesWeeks} onCommit={onCommit} />
      <HeartBlock spec={spec} />
    </ScrollView>
  );
}

/** One column a week: the outline is what was planned, the fill what was run. */
function Bars({ weeks, planned, done, label, tone = colors.mintDeep }: { weeks: WeekSoFar[]; planned: (w: WeekSoFar) => number; done: (w: WeekSoFar) => number; label: (w: WeekSoFar) => string; tone?: string }) {
  const max = Math.max(0.1, ...weeks.map((w) => Math.max(planned(w), done(w))));
  return (
    <View style={styles.bars}>
      {weeks.map((w) => {
        const ph = Math.round((planned(w) / max) * 72);
        const dh = Math.round((Math.min(done(w), max) / max) * 72);
        return (
          <View key={w.index} style={styles.barCol} accessible accessibilityLabel={`${ui().train.weekX(w.index)}: ${label(w)}`}>
            <View style={styles.barBox}>
              <View style={[styles.barPlanned, { height: Math.max(ph, 2) }, w.kind === 'light' && { borderColor: colors.lilacDeep }, w.when === 'now' && { borderColor: colors.ink }]} />
              {dh > 0 && <View style={[styles.barDone, { height: dh, backgroundColor: w.when === 'now' ? colors.ink : tone }]} />}
            </View>
            <Text style={[styles.barLabel, w.when === 'now' && { color: colors.ink }]}>{w.index}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PacesBlock({ plan, spec, today, unitsKm, pacesWeeks, onCommit }: { plan: Plan; spec: PlanSpec; today: number; unitsKm: boolean; pacesWeeks: number | null; onCommit: (p: Plan, said: string) => void }) {
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [s, setS] = useState('');
  const p = plan.paces;
  const goal = spec.goal === 'none' ? '10k' : spec.goal;
  const timeS = (parseInt(h || '0', 10) || 0) * 3600 + (parseInt(m || '0', 10) || 0) * 60 + (parseInt(s || '0', 10) || 0);
  const sane = km != null && timeS > 0 && timeS / km >= 150 && timeS / km <= 900; // 2:30 to 15:00 per km: anything else is a typo
  const race = plan.setup.race;
  const raceName = (d: number) => (d === 5 ? '5K' : d === 10 ? '10K' : d < 22 ? ui().train.half : ui().train.marathon);
  const predicted = (x: NonNullable<Plan['paces']>) => (goal === 'half' ? x.predicted.half : goal === 'marathon' ? x.predicted.marathon : goal === '5k' ? x.predicted['5k'] : x.predicted['10k']);

  function use() {
    if (km == null || !sane) return;
    const r = refreshPaces(plan, km, timeS, today);
    setOpen(false);
    onCommit(r.plan, r.capped ? ui().soFar.capped : ui().soFar.updated);
  }

  return (
    <Block title={ui().soFar.pacesTitle}>
      {p ? (
        <>
          {race && <Text style={styles.body}>{ui().soFar.pacesFrom(raceName(race.distanceKm), formatRaceTime(race.timeS), decimal(p.vdot.toFixed(1)))}</Text>}
          <Text style={styles.hint}>{ui().train.easyXXThresholdX(formatSPerKm(p.easy[0], unitsKm), formatSPerKm(p.easy[1], unitsKm), formatSPerKm(p.threshold, unitsKm), formatSPerKm(p.interval, unitsKm), GOAL_LABEL[goal].toLowerCase(), formatRaceTime(predicted(p)))}</Text>
          {pacesWeeks != null && pacesWeeks >= PACES_STALE_WEEKS && <Text style={[styles.hint, { color: colors.lilacDeep }]}>{ui().soFar.pacesStale(pacesWeeks)}</Text>}
        </>
      ) : (
        <Text style={styles.hint}>{ui().soFar.pacesNone}</Text>
      )}
      {spec.qualityDays > 0 && !open && <Button title={ui().soFar.newerRace} variant="secondary" onPress={() => setOpen(true)} />}
      {open && (
        <>
          <View style={styles.chips}>
            {RACES.map((d) => (
              <Pressable key={d} onPress={() => setKm(km === d ? null : d)} accessibilityRole="button" accessibilityState={{ selected: km === d }} style={[styles.chip, km === d && styles.chipOn]}>
                <Text style={[styles.chipText, km === d && styles.chipTextOn]}>{raceName(d)}</Text>
              </Pressable>
            ))}
          </View>
          {km != null && (
            <View style={styles.timeRow}>
              <Box value={h} onChange={setH} label="h" />
              <Box value={m} onChange={setM} label="min" />
              <Box value={s} onChange={setS} label="s" />
            </View>
          )}
          {sane && km != null && <Text style={styles.hint}>{ui().soFar.wouldGive(decimal(pacesFromRace(km, timeS).vdot.toFixed(1)))}</Text>}
          <Button title={ui().soFar.useIt} disabled={!sane} onPress={use} />
        </>
      )}
    </Block>
  );
}

/** The runner's own numbers for heart-rate ranges. Kept apart from the plan: they outlive it. */
function HeartBlock({ spec }: { spec: PlanSpec }) {
  const [h, setH] = useState<HeartSetup | null | undefined>(undefined);
  const [seen, setSeen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [max, setMax] = useState('');
  const [rest, setRest] = useState('');
  const [age, setAge] = useState('');
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    loadHeart().then(setH).catch(() => setH(null));
    highestHeartRate().then(setSeen).catch(() => {});
  }, []);
  if (h === undefined) return null;

  function edit() {
    setMax(h ? String(h.maxHr) : seen != null && saneMax(seen) ? String(seen) : '');
    setRest(h?.restHr != null ? String(h.restHr) : '');
    setAge('');
    setNudge(h?.easyNudge ?? false);
    setEditing(true);
  }
  const typed = parseInt(max || '0', 10);
  const fromAge = parseInt(age || '0', 10);
  const maxHr = saneMax(typed) ? typed : fromAge >= 12 && fromAge <= 90 ? maxFromAge(fromAge) : 0;
  const source: HeartSetup['source'] = saneMax(typed) ? (seen != null && typed === seen ? 'measured' : 'entered') : 'age';
  const restN = parseInt(rest || '0', 10);
  const draft: HeartSetup | null = saneMax(maxHr) ? { maxHr, restHr: rest && saneRest(restN, maxHr) ? restN : null, source, easyNudge: nudge } : null;

  async function save(next: HeartSetup | null) {
    await saveHeart(next).catch(() => {});
    setH(next);
    setEditing(false);
  }

  const show = (x: HeartSetup) => {
    const e = rangeFor('easy', spec.goal, x);
    const t = rangeFor('threshold', spec.goal, x);
    return e && t ? ui().zones.easyThreshold(ui().zones.rangeX(e[0], e[1]), ui().zones.rangeX(t[0], t[1])) : '';
  };

  return (
    <Block title={ui().zones.title}>
      {!editing && (h ? (
        <>
          <Text style={styles.body}>{ui().zones.summary(h.maxHr, h.restHr)}</Text>
          <Text style={styles.hint}>
            {ui().zones.from[h.source]} {show(h)}
          </Text>
          <Text style={styles.hint}>{ui().zones.medicine}</Text>
          <Button title={ui().zones.change} variant="secondary" onPress={edit} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>{ui().zones.none}</Text>
          <Text style={styles.hint}>{ui().zones.medicine}</Text>
          <Button title={ui().zones.set} variant="secondary" onPress={edit} />
        </>
      ))}
      {editing && (
        <>
          <View style={styles.timeRow}>
            <Box value={max} onChange={setMax} label={ui().zones.maxLabel} digits={3} />
            <Box value={rest} onChange={setRest} label={ui().zones.restLabel} digits={3} />
            {!saneMax(typed) && <Box value={age} onChange={setAge} label={ui().zones.ageLabel} />}
          </View>
          {seen != null && saneMax(seen) && <Text style={styles.hint}>{ui().zones.measuredHint(seen)}</Text>}
          {draft && <Text style={styles.hint}>{show(draft)}</Text>}
          <Pressable onPress={() => setNudge(!nudge)} accessibilityRole="switch" accessibilityState={{ checked: nudge }} style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyStrong}>{ui().zones.nudgeLabel}</Text>
              <Text style={styles.hint}>{ui().zones.nudgeHint}</Text>
            </View>
            <View style={[styles.switch, nudge && styles.switchOn]}>
              <View style={[styles.knob, nudge && styles.knobOn]} />
            </View>
          </Pressable>
          <Button title={ui().zones.save} disabled={!draft} onPress={() => void save(draft)} />
          {h && <Button title={ui().zones.remove} variant="secondary" onPress={() => void save(null)} />}
        </>
      )}
    </Block>
  );
}

function Box({ value, onChange, label, digits = 2 }: { value: string; onChange: (v: string) => void; label: string; digits?: number }) {
  return (
    <View style={styles.boxWrap}>
      <TextInput style={[styles.box, digits > 2 && { width: 80 }]} value={value} onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, digits))} keyboardType="number-pad" accessibilityLabel={label} maxLength={digits} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = themedStyles(() => ({
  scroll: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
  lede: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  block: { gap: spacing.sm, marginTop: spacing.xs },
  blockTitle: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.muted },
  phaseRow: { flexDirection: 'row', gap: 3, height: 32 },
  phase: { borderRadius: radius.sm, justifyContent: 'center', paddingHorizontal: 6, minWidth: 0 },
  phaseNow: { borderWidth: 2, borderColor: colors.ink },
  phaseText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.ink },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, minHeight: 92 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  barBox: { width: '100%', height: 72, justifyContent: 'flex-end' },
  barPlanned: { width: '100%', borderWidth: 1.5, borderColor: colors.inkMuted, borderRadius: 4, position: 'absolute', bottom: 0 },
  barDone: { width: '100%', borderRadius: 4 },
  barLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  chipTextOn: { color: colors.cream },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  boxWrap: { alignItems: 'center', gap: 2, flexShrink: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.track, padding: 3 },
  switchOn: { backgroundColor: colors.ink },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  knobOn: { transform: [{ translateX: 20 }] },
  box: { width: 64, minHeight: 48, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.ink, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 18, color: colors.text },
}));
