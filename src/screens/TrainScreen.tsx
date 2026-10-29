import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { SettingsGear } from '../components/SettingsGear';
import { Button } from '../components/Button';
import { PlanReminderCard } from '../components/PlanReminders';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import { applyHoliday, applyIllness, missedState, moveSession, rebuild, type MissedState } from '../training/adapt';
import { GOAL_LABEL, PLANS, checkGate, daysFit, planById, plansFor, type Goal, type PlanSpec, type RunnerProfile, type Tier } from '../training/catalogue';
import { WEEKDAY_LONG, WEEKDAY_SHORT, addDays, dayStart, daysBetween, formatDay, mondayOf, weekdayOf } from '../training/dates';
import { generate } from '../training/generate';
import { planToIcs } from '../training/ics';
import { formatRaceTime, formatSPerKm, pacesFromRace, type Paces } from '../training/paces';
import { RULES } from '../training/rules';
import { EFFORT_LABEL, paceFor, paceSetFor } from '../training/sessions';
import { createPlan, currentProfile, historyCount, lastRunAt, markDone, nextSession, runSessions, planEnd, planProgress, planSpec, refreshPlan, savePlan, setStatus, skipSession, todaySession, weekProgress } from '../training/store';
import type { Plan, PlanSetup, Session, Step, Week } from '../training/types';
import { LockRow } from '../components/LockRow';
import { isUnlocked, openWeeks, planSessionOpen, planWeekOpen, trainLine } from '../unlock';
import { openUnlock, useUnlocked } from '../unlockState';
import { live, ui } from '../i18n/ui';
import { dateLocale, decimal } from '../i18n/lang';

/**
 * The Train tab. Without a plan: the catalogue, a plan's page, its setup and a
 * short health check. With one: this week, each session, and the ways a plan
 * gives way (away, ill, a gap, pause, stop). Nothing here needs an account.
 */

type Page =
  | { kind: 'catalogue' }
  | { kind: 'detail'; spec: PlanSpec }
  | { kind: 'health'; spec: PlanSpec; setup: PlanSetup; runner: RunnerProfile; paces: Paces | null }
  | { kind: 'week'; index: number | null }
  | { kind: 'session'; id: string }
  | { kind: 'rules' }
  | { kind: 'how'; first: boolean }
  | { kind: 'away' }
  | { kind: 'ill' };

const TIER_LABEL: Record<Tier, string> = live(() => ui().train.tier);
const TIER_FILL: Record<Tier, string> = { start: colors.sky, keep: colors.mint, comeback: colors.lilac, finish: colors.mint, improve: colors.butter, race: colors.peach };
const DEFAULT_DAYS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 6], 4: [2, 4, 6, 0], 5: [1, 2, 4, 6, 0], 6: [1, 2, 3, 4, 6, 0] };
const KM_IN_MI = 1.609344;

export function TrainScreen({ refreshKey, onStartSession, onChanged }: { refreshKey: number; onStartSession: (s: Session) => void; onChanged: () => void }) {
  const { settings } = useSettings();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [profile, setProfile] = useState<RunnerProfile | null>(null);
  const [historyN, setHistoryN] = useState(0);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [view, setView] = useState<Page>({ kind: 'catalogue' });
  useUnlocked(); // a purchase opens the rest of the plan without leaving the tab

  const reload = useCallback(async () => {
    const [p, prof, n, last] = await Promise.all([refreshPlan(), currentProfile(), historyCount(), lastRunAt()]);
    setPlan(p);
    setProfile(prof);
    setHistoryN(n);
    setLastRun(last);
    setView((v) => (p && p.status !== 'stopped' && p.status !== 'done' && (v.kind === 'catalogue' || v.kind === 'detail' || v.kind === 'health') ? { kind: 'week', index: null } : v));
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload, refreshKey]);

  async function commit(next: Plan | null) {
    await savePlan(next);
    setPlan(next);
    onChanged();
  }

  if (plan === undefined || !profile) return <View style={styles.screen} />;

  const active = plan && (plan.status === 'active' || plan.status === 'paused') ? plan : null;

  if (view.kind === 'rules') return <RulesView onBack={() => setView(active ? { kind: 'week', index: null } : { kind: 'catalogue' })} />;

  if (!active) {
    if (view.kind === 'detail') return <DetailView spec={view.spec} profile={profile} historyN={historyN} unitsKm={settings.unitsKm} onBack={() => setView({ kind: 'catalogue' })} onRules={() => setView({ kind: 'rules' })} onStart={(setup, runner, paces) => setView({ kind: 'health', spec: view.spec, setup, runner, paces })} />;
    if (view.kind === 'health') {
      return (
        <HealthView
          onBack={() => setView({ kind: 'detail', spec: view.spec })}
          onStart={async () => {
            const made = createPlan(view.spec, view.setup, view.runner, view.paces);
            if (!made.ok) {
              Alert.alert(ui().train.thatDoesNotFit, made.message);
              return;
            }
            await commit(made.plan);
            setView({ kind: 'how', first: true });
          }}
        />
      );
    }
    return <Catalogue profile={profile} historyN={historyN} lastPlan={plan} onPick={(spec) => setView({ kind: 'detail', spec })} onRules={() => setView({ kind: 'rules' })} />;
  }

  const spec = planSpec(active);
  const today = dayStart(Date.now());

  const opened = view.kind === 'session' ? active.weeks.flatMap((w) => w.sessions).find((x) => x.id === view.id) : undefined;
  if (opened) {
    const s = opened;
    return (
      <SessionView
        plan={active}
        spec={spec}
        session={s}
        unitsKm={settings.unitsKm}
        today={today}
        onBack={() => setView({ kind: 'week', index: active.weeks.find((w) => w.sessions.includes(s))?.index ?? null })}
        onStart={() => onStartSession(s)}
        onDone={() => commit(markDone(active, s.id))}
        onSkip={() => commit(skipSession(active, s.id))}
        onMove={(date) => {
          const r = moveSession(active, s.id, date);
          if (!r.ok) Alert.alert(ui().train.notThatDay, r.reason);
          else commit(r.plan);
        }}
      />
    );
  }
  if (view.kind === 'how') return <HowView plan={active} spec={spec} first={view.first} onDone={() => setView({ kind: 'week', index: null })} />;
  if (view.kind === 'away') {
    return (
      <AwayView
        today={today}
        onBack={() => setView({ kind: 'week', index: null })}
        onConfirm={async (from, to) => {
          const r = applyHoliday(active, from, to, today, profile);
          await commit(r.plan);
          setView({ kind: 'week', index: null });
        }}
      />
    );
  }
  if (view.kind === 'ill') {
    return (
      <IllView
        onBack={() => setView({ kind: 'week', index: null })}
        onConfirm={async (days) => {
          const r = applyIllness(active, today, days, profile);
          await commit(r.plan);
          setView({ kind: 'week', index: null });
        }}
      />
    );
  }

  return (
    <WeekView
      plan={active}
      spec={spec}
      today={today}
      index={view.kind === 'week' ? view.index : null}
      unitsKm={settings.unitsKm}
      missed={missedState(active, today, lastRun)}
      onOpen={(id) => setView({ kind: 'session', id })}
      onStart={(s) => onStartSession(s)}
      onHow={() => setView({ kind: 'how', first: false })}
      onWeek={(index) => setView({ kind: 'week', index })}
      onRules={() => setView({ kind: 'rules' })}
      onAway={() => setView({ kind: 'away' })}
      onIll={() => setView({ kind: 'ill' })}
      onRebuild={async (kind) => {
        const r = rebuild(active, spec, today, profile, kind);
        if (!r.ok) Alert.alert(ui().train.couldNotRebuild, r.message);
        else await commit(r.plan);
      }}
      onPause={() => commit(setStatus(active, active.status === 'paused' ? 'active' : 'paused'))}
      onStop={() => {
        Alert.alert(ui().train.stopThisPlan, ui().train.theWeeksStayInYour, [
          { text: ui().train.keepGoing, style: 'cancel' },
          {
            text: ui().train.stopPlan,
            style: 'destructive',
            onPress: async () => {
              await commit(setStatus(active, 'stopped'));
              setView({ kind: 'catalogue' });
            },
          },
        ]);
      }}
      onCalendar={() => exportCalendar(openWeeks(active))}
    />
  );
}

// ---- Catalogue ------------------------------------------------------------------

function Catalogue({ profile, historyN, lastPlan, onPick, onRules }: { profile: RunnerProfile; historyN: number; lastPlan: Plan | null; onPick: (spec: PlanSpec) => void; onRules: () => void }) {
  const goals: Goal[] = ['none', '5k', '10k', 'half', 'marathon'];
  const [goal, setGoal] = useState<Goal>(lastPlan ? planById(lastPlan.setup.planId)?.goal ?? 'none' : 'none');
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <View style={styles.topRow}>
        <Text style={type.eyebrow}>{ui().train.train}</Text>
        <SettingsGear />
      </View>
      <Text style={styles.h1}>{ui().train.structureWithoutTheShouting}</Text>
      <Text style={styles.lede}>{ui().train.fourteenPlansFromAFirst}</Text>
      {lastPlan?.status === 'done' && <Text style={styles.note}>{ui().train.xIsDoneXRuns(lastPlan.name, planProgress(lastPlan).done, fmtKm(planProgress(lastPlan).kmDone, true))}</Text>}
      <View style={styles.chips}>
        {goals.map((g) => (
          <Chip key={g} label={GOAL_LABEL[g]} on={goal === g} onPress={() => setGoal(g)} />
        ))}
      </View>
      {plansFor(goal).map((spec) => (
        <PlanCard key={spec.id} spec={spec} profile={profile} historyN={historyN} onPress={() => onPick(spec)} />
      ))}
      <Pressable onPress={onRules} style={{ paddingVertical: spacing.sm }} accessibilityRole="button">
        <Text style={styles.link}>{ui().train.theNineRulesEveryPlan}</Text>
      </Pressable>
      <Text style={styles.foot}>{ui().train.noAccountNoServerA}</Text>
    </ScrollView>
  );
}

function PlanCard({ spec, profile, historyN, onPress }: { spec: PlanSpec; profile: RunnerProfile; historyN: number; onPress: () => void }) {
  const gate = checkGate(spec, profile);
  const thin = historyN < 4;
  const days = spec.daysOptions.length > 1 ? `${spec.daysOptions[0]}–${spec.daysOptions[spec.daysOptions.length - 1]}` : `${spec.daysOptions[0]}`;
  const fit = thin ? (spec.gate.text ? ui().train.expectsX(lower(spec.gate.text)) : ui().train.noHistoryNeeded) : gate.ok ? ui().train.fitsWhereYouAreNow : `${gate.reason}${gate.bridge ? ui().train.startWithX(planById(gate.bridge)?.name ?? gate.bridge) : ''}`;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{spec.name}</Text>
        <View style={[styles.pill, { backgroundColor: TIER_FILL[spec.tier] }]}>
          <Text style={styles.pillText}>{TIER_LABEL[spec.tier]}</Text>
        </View>
      </View>
      <Text style={styles.cardBlurb}>{spec.blurb}</Text>
      <Text style={styles.cardMeta}>
        {ui().train.cardMeta(spec.tier === 'keep' ? null : spec.weeks, days)}
      </Text>
      <Text style={[styles.cardFit, { color: thin ? colors.muted : gate.ok ? colors.mintDeep : colors.peachDeep }]}>{fit}</Text>
    </Pressable>
  );
}

// ---- Plan page and setup -------------------------------------------------------

function DetailView({ spec, profile, historyN, unitsKm, onBack, onRules, onStart }: { spec: PlanSpec; profile: RunnerProfile; historyN: number; unitsKm: boolean; onBack: () => void; onRules: () => void; onStart: (setup: PlanSetup, runner: RunnerProfile, paces: Paces | null) => void }) {
  const today = dayStart(Date.now());
  const thin = historyN < 4;
  const [days, setDays] = useState(spec.daysOptions.find((d) => daysFit(spec, profile, d)) ?? spec.daysOptions[0]);
  const [runDays, setRunDays] = useState<number[]>(DEFAULT_DAYS[days] ?? [2, 4, 6]);
  const [longDay, setLongDay] = useState<number>(defaultLongDay(DEFAULT_DAYS[days] ?? [2, 4, 6]));
  const [raceDate, setRaceDate] = useState<number>(addDays(mondayOf(today), 7 * spec.weeks - 1));
  const [extra, setExtra] = useState(false);
  const [weekly, setWeekly] = useState(Math.round(profile.weeklyKm));
  const [longest, setLongest] = useState(Math.round(profile.longestKm30));
  const [raceKm, setRaceKm] = useState<number | null>(null);
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [sec, setSec] = useState('');

  function pickDays(n: number) {
    setDays(n);
    const d = DEFAULT_DAYS[n] ?? runDays.slice(0, n);
    setRunDays(d);
    setLongDay(defaultLongDay(d));
  }
  function toggleDay(d: number) {
    if (runDays.includes(d)) {
      if (runDays.length <= 1) return;
      const next = runDays.filter((x) => x !== d);
      setRunDays(next);
      if (longDay === d) setLongDay(defaultLongDay(next));
      setDays(next.length);
    } else {
      const next = [...runDays, d].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
      setRunDays(next);
      setDays(next.length);
    }
  }

  const timeS = (parseInt(h || '0', 10) || 0) * 3600 + (parseInt(m || '0', 10) || 0) * 60 + (parseInt(sec || '0', 10) || 0);
  const paces = useMemo(() => (raceKm != null && timeS > 0 ? safePaces(raceKm, timeS) : null), [raceKm, timeS]);
  const runner: RunnerProfile = useMemo(() => {
    const easy = paces ? Math.round((paces.easy[0] + paces.easy[1]) / 2) : profile.easyPaceSPerKm;
    return thin ? { weeklyKm: weekly, longestKm30: longest, runsPerWeek: weekly > 0 ? days : 0, easyPaceSPerKm: easy } : { ...profile, easyPaceSPerKm: easy };
  }, [thin, weekly, longest, days, profile, paces]);
  const setup: PlanSetup = useMemo(
    () => ({ planId: spec.id, startDate: today, raceDate: spec.raceKm != null ? raceDate : null, runDays, longRunDay: longDay, daysPerWeek: runDays.length, extraRecovery: extra, race: paces && raceKm != null ? { distanceKm: raceKm, timeS } : null }),
    [spec, today, raceDate, runDays, longDay, extra, paces, raceKm, timeS],
  );
  const preview = useMemo(() => generate({ spec, setup, runner, paces }), [spec, setup, runner, paces]);
  const gate = checkGate(spec, runner);
  const daysOk = spec.daysOptions.includes(runDays.length);
  const weeksToRace = Math.round(daysBetween(mondayOf(today), raceDate) / 7);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Back onPress={onBack} label={ui().train.allPlans} />
      <Text style={type.eyebrow}>{GOAL_LABEL[spec.goal]} · {TIER_LABEL[spec.tier]}</Text>
      <Text style={styles.h1}>{spec.name}</Text>
      <Text style={styles.lede}>{spec.blurb}</Text>
      <Text style={styles.body}>
        {spec.tier === 'keep' ? ui().train.fourWeeksAtATime : ui().train.weeksSentence(spec.weeks)} {spec.timeBased ? ui().train.measuredInMinutesNotKilometres : ui().train.longRunsUpToX(fmtKm(spec.longCapKm ?? 0, unitsKm))} {spec.qualityDays === 0 ? ui().train.nothingHardEasyRunningWith : spec.qualityDays === 1 ? ui().train.oneHarderSessionAWeek : ui().train.twoHarderSessionsAWeek}
      </Text>

      <Section title={ui().train.whereYouAre}>
        {thin ? (
          <>
            <Text style={styles.hint}>{ui().train.fewerThanFourRunsHere}</Text>
            <Stepper label={unitsKm ? ui().train.kilometresAWeekLately : ui().train.milesAWeekLately} value={weekly} onChange={setWeekly} min={0} max={150} step={unitsKm ? 5 : 5 * KM_IN_MI} format={(v) => fmtKm(v, unitsKm, 0)} />
            <Stepper label={ui().train.longestRunInTheLast} value={longest} onChange={setLongest} min={0} max={45} step={unitsKm ? 1 : KM_IN_MI} format={(v) => fmtKm(v, unitsKm, 0)} />
          </>
        ) : (
          <Text style={styles.hint}>{ui().train.fromYourLastFourWeeks(fmtKm(profile.weeklyKm, unitsKm, 0), profile.runsPerWeek.toFixed(1), fmtKm(profile.longestKm30, unitsKm))}</Text>
        )}
        {!gate.ok && <Text style={[styles.hint, { color: colors.peachDeep }]}>{gate.reason}{gate.bridge ? ui().train.xIsTheBridgeTo(planById(gate.bridge)?.name ?? '') : ''}</Text>}
      </Section>

      <Section title={ui().train.runsAWeek}>
        <View style={styles.chips}>
          {spec.daysOptions.map((n) => (
            <Chip key={n} label={String(n)} on={days === n} onPress={() => pickDays(n)} />
          ))}
        </View>
        <Text style={styles.hint}>{ui().train.whichDays}</Text>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} on={runDays.includes(d)} onPress={() => toggleDay(d)} small />
          ))}
        </View>
        {!daysOk && <Text style={[styles.hint, { color: colors.peachDeep }]}>{ui().train.thisPlanRunsXDays(spec.daysOptions)}</Text>}
        <Text style={styles.hint}>{ui().train.longRunOn}</Text>
        <View style={styles.chips}>
          {runDays.map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} on={longDay === d} onPress={() => setLongDay(d)} small />
          ))}
        </View>
      </Section>

      {spec.raceKm != null && (
        <Section title={ui().train.raceDay}>
          <Text style={styles.big}>{formatDay(raceDate)}</Text>
          <Text style={styles.hint}>{ui().train.xWeeksFromNowThe(weeksToRace, spec.weeks, spec.minWeeks)}</Text>
          <View style={styles.chips}>
            <Chip label={ui().train.week} onPress={() => setRaceDate((d) => addDays(d, -7))} />
            <Chip label={ui().train.week2} onPress={() => setRaceDate((d) => addDays(d, 7))} />
            <Chip label={ui().train.day} onPress={() => setRaceDate((d) => addDays(d, -1))} />
            <Chip label={ui().train.day2} onPress={() => setRaceDate((d) => addDays(d, 1))} />
          </View>
        </Section>
      )}

      <Section title={ui().train.extraRecovery}>
        <Toggle value={extra} onChange={setExtra} label={ui().train.aLighterWeekEveryThird} hint={ui().train.forOver50sAReturn} />
      </Section>

      {spec.qualityDays > 0 && (
        <Section title={ui().train.aRecentRaceIfYou}>
          <Text style={styles.hint}>{ui().train.optionalWithoutItEverySession}</Text>
          <View style={styles.chips}>
            {[5, 10, 21.0975, 42.195].map((d) => (
              <Chip key={d} label={d === 5 ? '5K' : d === 10 ? '10K' : d < 22 ? ui().train.half : ui().train.marathon} on={raceKm === d} onPress={() => setRaceKm(raceKm === d ? null : d)} small />
            ))}
          </View>
          {raceKm != null && (
            <View style={styles.timeRow}>
              <TimeBox value={h} onChange={setH} label="h" />
              <TimeBox value={m} onChange={setM} label="min" />
              <TimeBox value={sec} onChange={setSec} label="s" />
            </View>
          )}
          {paces && (
            <Text style={styles.hint}>{ui().train.easyXXThresholdX(formatSPerKm(paces.easy[0], unitsKm), formatSPerKm(paces.easy[1], unitsKm), formatSPerKm(paces.threshold, unitsKm), formatSPerKm(paces.interval, unitsKm), GOAL_LABEL[spec.goal === 'none' ? '10k' : spec.goal].toLowerCase(), formatRaceTime(spec.goal === 'half' ? paces.predicted.half : spec.goal === 'marathon' ? paces.predicted.marathon : spec.goal === '5k' ? paces.predicted['5k'] : paces.predicted['10k']))}</Text>
          )}
        </Section>
      )}

      <Section title={ui().train.weekOne}>
        {preview.ok ? (
          <>
            {preview.weeks[0].sessions.map((s) => (
              <View key={s.id} style={styles.previewRow}>
                <Text style={styles.previewDay}>{WEEKDAY_SHORT[weekdayOf(s.date)]}</Text>
                <Text style={styles.previewTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={styles.previewSize}>{sizeOf(s, spec, unitsKm)}</Text>
              </View>
            ))}
            <Text style={styles.hint}>
              {spec.timeBased ? ui().train.runAndWalkInMinutes : ui().train.weekOneAboutXPeak(fmtKm(preview.weeks[0].targetKm, unitsKm, 0), fmtKm(preview.peakKm, unitsKm, 0))} {ui().train.everyWeekIsChecked}
            </Text>
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.peachDeep }]}>{preview.message}</Text>
        )}
      </Section>

      <Pressable onPress={onRules} style={{ paddingVertical: spacing.xs }} accessibilityRole="button">
        <Text style={styles.link}>{ui().train.theNineRules}</Text>
      </Pressable>
      <Button title={ui().train.startThisPlan} disabled={!preview.ok || !daysOk} onPress={() => onStart(setup, runner, paces)} />
      {!isUnlocked() && <TrainLockLine weeks={spec.tier === 'keep' ? null : spec.weeks} />}
      {!gate.ok && preview.ok && <Text style={styles.hint}>{ui().train.youCanStartAnywayThe}</Text>}
    </ScrollView>
  );
}

/** The Train line: week 1 is free, the rest comes with the unlock. Tapping it opens Everything, once. */
function TrainLockLine({ weeks }: { weeks: number | null }) {
  const line = trainLine(weeks);
  return (
    <Pressable onPress={openUnlock} accessibilityRole="button" accessibilityLabel={line} accessibilityHint={ui().train.opensEverythingOnce} style={({ pressed }) => [styles.lockLine, pressed && { opacity: 0.85 }]}>
      <Text style={styles.lockLineText}>{line}</Text>
    </Pressable>
  );
}

// ---- Health check ----------------------------------------------------------------

const HEALTH_QUESTIONS: string[] = live(() => ui().train.healthQuestions);

function HealthView({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const [answers, setAnswers] = useState<Array<boolean | null>>(HEALTH_QUESTIONS.map(() => null));
  const anyYes = answers.some((a) => a === true);
  const complete = answers.every((a) => a !== null);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={ui().train.setup} />
      <Text style={type.eyebrow}>{ui().train.beforeTheFirstWeek}</Text>
      <Text style={styles.h1}>{ui().train.sevenQuestions}</Text>
      <Text style={styles.lede}>{ui().train.theOnesAPhysioWould}</Text>
      {HEALTH_QUESTIONS.map((q, i) => (
        <View key={q} style={styles.question}>
          <Text style={styles.body}>{q}</Text>
          <View style={styles.chips}>
            <Chip label={ui().train.no} on={answers[i] === false} onPress={() => setAnswers((a) => a.map((x, j) => (j === i ? false : x)))} small />
            <Chip label={ui().train.yes} on={answers[i] === true} onPress={() => setAnswers((a) => a.map((x, j) => (j === i ? true : x)))} small />
          </View>
        </View>
      ))}
      {complete && anyYes && (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>{ui().train.talkToADoctorFirst}</Text>
          <Text style={styles.body}>{ui().train.aYesUpThereIs}</Text>
        </View>
      )}
      <Button title={anyYes ? ui().train.aDoctorHasClearedMe : ui().train.startThePlan} disabled={!complete} onPress={onStart} />
      {complete && anyYes && <Button title={ui().train.notNow} variant="secondary" onPress={onBack} />}
    </ScrollView>
  );
}

// ---- The week --------------------------------------------------------------------

function WeekView(props: {
  plan: Plan;
  spec: PlanSpec;
  today: number;
  index: number | null;
  unitsKm: boolean;
  missed: MissedState;
  onOpen: (id: string) => void;
  onStart: (s: Session) => void;
  onHow: () => void;
  onWeek: (index: number) => void;
  onRules: () => void;
  onAway: () => void;
  onIll: () => void;
  onRebuild: (kind: 'repeat' | 'stepback') => void;
  onPause: () => void;
  onStop: () => void;
  onCalendar: () => void;
}) {
  const { plan, spec, today, unitsKm, missed } = props;
  const weeks = plan.weeks;
  const current = weeks.find((w) => today >= w.start && today < addDays(w.start, 7)) ?? (today < weeks[0].start ? weeks[0] : weeks[weeks.length - 1]);
  const week = (props.index != null ? weeks.find((w) => w.index === props.index) : null) ?? current;
  const i = weeks.indexOf(week);
  const prog = weekProgress(week);
  const total = planProgress(plan);
  const paused = plan.status === 'paused';
  const behind = missed.kind !== 'none' && plan.weeks.flatMap((w) => w.sessions).some((s) => s.date < today && !s.done && !s.skipped && s.kind !== 'strength' && planSessionOpen(plan, s.id));
  const raceIn = plan.setup.raceDate != null ? daysBetween(today, plan.setup.raceDate) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <View style={styles.topRow}>
        <Text style={[type.eyebrow, { flex: 1 }]}>
          {plan.name} · {ui().train.weekOf(current.index, spec.tier === 'keep' ? '∞' : weeks[weeks.length - 1].index)}
        </Text>
        <SettingsGear />
      </View>
      <Text style={styles.h1}>{weekHeadline(current, current, today, raceIn)}</Text>

      {paused ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{ui().train.paused}</Text>
          <Text style={styles.body}>{ui().train.nothingCountsAsMissedWhile}</Text>
        </View>
      ) : (
        <TodayCard plan={plan} spec={spec} today={today} unitsKm={unitsKm} onOpen={props.onOpen} onStart={props.onStart} />
      )}
      {!isUnlocked() && weeks.length > 1 && <TrainLockLine weeks={spec.tier === 'keep' ? null : weeks[weeks.length - 1].index} />}
      {!paused && behind && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{missedTitle(missed)}</Text>
          <Text style={styles.body}>{missedText(missed)}</Text>
          <View style={styles.chips}>
            <Chip label={missed.kind === 'repeat' ? ui().train.repeatLastWeek : ui().train.stepBackAndRebuild} on onPress={() => props.onRebuild(missed.kind === 'repeat' ? 'repeat' : 'stepback')} />
          </View>
        </View>
      )}

      <Section title={week === current ? ui().train.thisWeek : ui().train.weekX(week.index)}>
        <Text style={styles.weekLede}>{week === current ? weekLede(week, spec, unitsKm) : `${weekHeadline(week, current, today, raceIn)} ${weekLede(week, spec, unitsKm)}`}</Text>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((prog.kmDone / Math.max(prog.kmTarget, 0.1)) * 100))}%` as `${number}%` }]} />
        </View>
        <Text style={styles.hint}>{ui().train.xOfXRunsX(prog.done, prog.total, fmtKm(prog.kmDone, unitsKm), fmtKm(prog.kmTarget, unitsKm))}</Text>

        <View style={styles.weekNav}>
          <Pressable disabled={i <= 0} onPress={() => props.onWeek(weeks[i - 1].index)} accessibilityRole="button" accessibilityLabel={i > 0 ? ui().train.previousWeekWeekX(weeks[i - 1].index) : ui().train.previousWeek} accessibilityState={{ disabled: i <= 0 }} style={[styles.navBtn, i <= 0 && { opacity: 0.3 }]} hitSlop={8}>
            <Text style={styles.navText}>‹ {ui().train.weekX(i > 0 ? weeks[i - 1].index : '')}</Text>
          </Pressable>
          {week !== current && (
            <Pressable onPress={() => props.onWeek(current.index)} accessibilityRole="button" accessibilityLabel={ui().train.backToThisWeek} hitSlop={8}>
              <Text style={styles.link}>{ui().train.backToThisWeek}</Text>
            </Pressable>
          )}
          <Pressable disabled={i >= weeks.length - 1} onPress={() => props.onWeek(weeks[i + 1].index)} accessibilityRole="button" accessibilityLabel={i < weeks.length - 1 ? ui().train.nextWeekWeekX(weeks[i + 1].index) : ui().train.nextWeek} accessibilityState={{ disabled: i >= weeks.length - 1 }} style={[styles.navBtn, i >= weeks.length - 1 && { opacity: 0.3 }]} hitSlop={8}>
            <Text style={styles.navText}>{ui().train.weekX(i < weeks.length - 1 ? weeks[i + 1].index : '')} ›</Text>
          </Pressable>
        </View>

        {!planWeekOpen(plan, week.index) ? (
          <LockRow title={ui().train.weekX(week.index)} />
        ) : (
        <View style={styles.days}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const date = addDays(week.start, d);
            const runs = week.sessions.filter((s) => s.date === date && s.kind !== 'strength');
            const strength = week.sessions.find((s) => s.date === date && s.kind === 'strength');
            const s = runs[0];
            return <DayRow key={date} date={date} today={today} session={s ?? null} strength={!!strength} spec={spec} unitsKm={unitsKm} onPress={s ? () => props.onOpen(s.id) : undefined} />;
          })}
        </View>
        )}
        <Legend />
        <Text style={styles.hint}>{ui().train.tapADayForIts}</Text>
      </Section>

      <Section title={ui().train.theWholePlan}>
        <WeekStrip weeks={weeks} current={current} shown={week} keep={spec.tier === 'keep'} onWeek={props.onWeek} />
        <Text style={styles.hint}>{planLine(plan, spec, current, total, today)}</Text>
      </Section>

      <Section title={ui().train.reminders}>
        <PlanReminderCard paused={paused} />
      </Section>

      <Section title={ui().train.whenLifeHappens}>
        <Row label={ui().train.howAPlanWorks} hint={ui().train.todayThisWeekRemindersAnd} onPress={props.onHow} />
        <Row label={ui().train.addThePlanToA} hint={ui().train.anIcsFileAppleGoogle} onPress={props.onCalendar} />
        <Row label={ui().train.iMAwayForA} hint={ui().train.plannedRestNotAMiss} onPress={props.onAway} />
        <Row label={ui().train.iMIll} hint={ui().train.restUntilBetterThenAs} onPress={props.onIll} />
        <Row label={paused ? ui().train.resumeThePlan : ui().train.pauseThePlan} hint={paused ? ui().train.pickUpFromThisWeek : ui().train.nothingIsCountedAsMissed} onPress={props.onPause} />
        <Row label={ui().train.theNineRules2} hint={ui().train.whatThePlanWillNever} onPress={props.onRules} />
        <Row label={ui().train.stopThisPlan2} hint={ui().train.theWeeksStayInYour2} onPress={props.onStop} danger />
      </Section>
      {plan.log.length > 0 && (
        <Section title={ui().train.whatChangedAlongTheWay}>
          {plan.log
            .slice(-5)
            .reverse()
            .map((e, k) => (
              <Text key={k} style={styles.hint}>
                {formatDay(e.at)} · {logLine(e)}
              </Text>
            ))}
        </Section>
      )}
    </ScrollView>
  );
}

function DayRow({ date, today, session, strength, spec, unitsKm, onPress }: { date: number; today: number; session: Session | null; strength: boolean; spec: PlanSpec; unitsKm: boolean; onPress?: () => void }) {
  const isToday = date === today;
  const past = date < today;
  const s = session;
  const state = !s ? (strength ? ui().train.strengthOptional : ui().train.rest) : s.done ? ui().train.done : s.skipped ? ui().train.skipped : isToday ? ui().train.today : past ? ui().train.missed : '';
  const dot = !s ? colors.cream : s.kind === 'race' ? colors.peach : s.hard ? colors.peach : s.kind === 'long' ? colors.butter : colors.mint;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityHint={onPress ? ui().train.opensTheSession : undefined}
      accessibilityLabel={[
        `${isToday ? ui().train.today2 : ''}${new Date(date).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}`,
        s ? s.title : strength ? ui().train.strengthIfYouLike : ui().train.rest,
        s ? (s.done ? doneText(s.done, unitsKm) : sizeOf(s, spec, unitsKm)) : null,
        s?.note ?? null,
        state && state !== ui().train.today && state !== ui().train.rest ? state : null,
      ]
        .filter(Boolean)
        .join('. ')}
      style={[styles.dayRow, isToday && styles.dayRowToday, s?.skipped && { opacity: 0.55 }]}
    >
      <View style={{ width: 44 }}>
        <Text style={[styles.dayName, isToday && { color: colors.cream }]}>{WEEKDAY_SHORT[weekdayOf(date)]}</Text>
        <Text style={[styles.dayDate, isToday && { color: colors.onInkMuted }]}>{new Date(date).getDate()}</Text>
      </View>
      <View style={[styles.dayDot, { backgroundColor: dot }, !s && { borderWidth: 1, borderColor: colors.lilac }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.dayTitle, isToday && { color: colors.cream }, s?.skipped && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
          {s ? s.title : strength ? ui().train.strengthIfYouLike : ui().train.rest}
        </Text>
        {s && (
          <Text style={[styles.daySub, isToday && { color: colors.onInkMuted }]} numberOfLines={1}>
            {s.done ? doneText(s.done, unitsKm) : sizeOf(s, spec, unitsKm)}
            {s.note ? ` · ${s.note}` : ''}
          </Text>
        )}
      </View>
      <Text style={[styles.dayState, isToday && { color: colors.butter }, s?.done && { color: colors.mintDeep }]}>{state}</Text>
    </Pressable>
  );
}

// ---- Today, the legend, the whole plan -------------------------------------------

/** The one thing to know when you open the tab: what today asks, and what comes next. */
function TodayCard({ plan, spec, today, unitsKm, onOpen, onStart }: { plan: Plan; spec: PlanSpec; today: number; unitsKm: boolean; onOpen: (id: string) => void; onStart: (s: Session) => void }) {
  const s = todaySession(plan, today);
  const next = nextSession(plan, addDays(today, 1));
  const nextLine = next ? ui().train.nextXXXX(WEEKDAY_LONG[weekdayOf(next.date)], daysBetween(today, next.date) > 6 ? ` ${new Date(next.date).getDate()}` : '', lower(next.title), sizeOf(next, spec, unitsKm)) : ui().train.thatWasTheLastSession;
  const notStarted = today < plan.weeks[0].start || (!s && runSessions(plan).every((x) => x.date > today && !x.done));

  if (s && !s.done && !s.skipped) {
    return (
      <View style={styles.today}>
        <Text style={styles.todayLabel}>{ui().train.today}</Text>
        <Text style={styles.todayTitle}>{s.title}</Text>
        <Text style={styles.body}>{s.summary}</Text>
        <Text style={styles.hint}>
          {sizeOf(s, spec, unitsKm)} · {s.hard ? ui().train.aHarderDay : s.kind === 'long' ? ui().train.theLongRunSlow : ui().train.easyYouCanTalkThe}
        </Text>
        {planSessionOpen(plan, s.id) ? <Button title={ui().train.startTodaySSession} onPress={() => onStart(s)} style={{ marginTop: 6 }} /> : <LockRow title={ui().train.guidedSessionsAfterWeek1} style={{ marginTop: 6 }} />}
        <Pressable onPress={() => onOpen(s.id)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 4 }}>
          <Text style={styles.link}>{ui().train.seeTheStepsMoveOr}</Text>
        </Pressable>
        <Text style={styles.hint}>{ui().train.anyRunTodayCountsFor}</Text>
      </View>
    );
  }
  const title = s?.done ? ui().train.doneForToday : s?.skipped ? ui().train.setAsideToday : notStarted ? ui().train.thePlanStartsSoon : ui().train.restToday;
  const text = s?.done
    ? ui().train.xLoggedAgainstThePlan(s.done.distanceM > 0 || s.done.durationS > 0 ? `${doneText(s.done, unitsKm)}. ` : '')
    : s?.skipped
      ? ui().train.nothingLostAndNothingAdded
      : notStarted
        ? ui().train.nothingToDoUntilThe
        : ui().train.restIsPartOfThe;
  return (
    <View style={[styles.today, styles.todayQuiet]}>
      <Text style={styles.todayLabel}>{ui().train.today}</Text>
      <Text style={styles.todayTitle}>{title}</Text>
      <Text style={styles.body}>{text}</Text>
      {next ? (
        <Pressable onPress={() => onOpen(next.id)} hitSlop={6}>
          <Text style={styles.todayNext}>{nextLine} ›</Text>
        </Pressable>
      ) : (
        <Text style={styles.todayNext}>{nextLine}</Text>
      )}
    </View>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    [colors.mint, ui().train.easy],
    [colors.butter, ui().train.long],
    [colors.peach, ui().train.harder],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([c, l]) => (
        <View key={l} style={styles.legendItem}>
          <View style={[styles.dayDot, { backgroundColor: c }]} />
          <Text style={styles.hint}>{l}</Text>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.dayDot, { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.lilac }]} />
        <Text style={styles.hint}>{ui().train.rest}</Text>
      </View>
    </View>
  );
}

/** Every week as a bar, as tall as its distance: the build, the lighter weeks, the taper, at a glance. */
function WeekStrip({ weeks, current, shown, keep, onWeek }: { weeks: Week[]; current: Week; shown: Week; keep: boolean; onWeek: (index: number) => void }) {
  const max = Math.max(...weeks.map((w) => w.targetKm), 0.1);
  return (
    <View>
      <View style={styles.strip}>
        {weeks.map((w) => {
          const past = w.start < current.start;
          const fill = w === current ? colors.ink : w.kind === 'light' ? colors.lilac : w.kind === 'race' || w.kind === 'taper' ? colors.peach : past ? colors.mintDeep : colors.mint;
          return (
            <Pressable key={w.index} onPress={() => onWeek(w.index)} style={styles.stripCol} accessibilityLabel={ui().train.weekX(w.index)} hitSlop={4}>
              <View style={[styles.stripBar, { height: 8 + Math.round((w.targetKm / max) * 56), backgroundColor: fill }, w === shown && w !== current && styles.stripShown]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.stripFoot}>
        <Text style={styles.stripLabel}>{ui().train.weekX(weeks[0].index)}</Text>
        <Text style={styles.stripLabel}>{keep ? ui().train.thenFourMore : weeks[weeks.length - 1].kind === 'race' ? ui().train.race : ui().train.weekX(weeks[weeks.length - 1].index)}</Text>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, { backgroundColor: colors.ink }]} />
          <Text style={styles.hint}>{ui().train.now}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, { backgroundColor: colors.lilac }]} />
          <Text style={styles.hint}>{ui().train.lighterWeek}</Text>
        </View>
        {weeks.some((w) => w.kind === 'taper' || w.kind === 'race') && (
          <View style={styles.legendItem}>
            <View style={[styles.dayDot, { backgroundColor: colors.peach }]} />
            <Text style={styles.hint}>{ui().train.taperAndRace}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function planLine(plan: Plan, spec: PlanSpec, current: Week, total: { done: number; total: number }, today: number): string {
  const end = plan.setup.raceDate ?? planEnd(plan);
  const left = Math.max(0, daysBetween(today, end));
  const when = plan.setup.raceDate != null ? ui().train.raceOn(formatDay(plan.setup.raceDate), left) : spec.tier === 'keep' ? ui().train.aNewBlockOfFour : ui().train.endsX(formatDay(end));
  return ui().train.xOfXRunsDone(total.done, total.total, when);
}

// ---- How a plan works --------------------------------------------------------------

function HowView({ plan, spec, first, onDone }: { plan: Plan; spec: PlanSpec; first: boolean; onDone: () => void }) {
  const light = plan.setup.extraRecovery ? 3 : 4;
  const points: Array<[string, string]> = [
    [ui().train.today, ui().train.eachDayHasOneThing],
    [ui().train.thisWeek, ui().train.xRunsOnTheDays(plan.setup.daysPerWeek)],
    [spec.tier === 'keep' ? ui().train.theBlocks : ui().train.thePlan, ui().train.theWeeksBuildSlowly(light, plan.setup.raceDate != null)],
    [ui().train.whenYouMissDays, ui().train.nothingIsDoubledUpTo],
  ];
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      {!first && <Back onPress={onDone} label={ui().train.thisWeek} />}
      <Text style={type.eyebrow}>{first ? plan.name : ui().train.howAPlanWorks}</Text>
      <Text style={styles.h1}>{first ? ui().train.yourPlanIsSetHere : ui().train.fourThingsThenJustRun}</Text>
      {points.map(([t, b], k) => (
        <View key={t} style={styles.rule}>
          <Text style={styles.ruleN}>{k + 1}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.ruleTitle}>{t}</Text>
            <Text style={styles.body}>{b}</Text>
          </View>
        </View>
      ))}
      <Section title={ui().train.reminders}>
        <PlanReminderCard paused={plan.status === 'paused'} />
      </Section>
      <Button title={first ? ui().train.seeThisWeek : ui().train.backToThisWeek} onPress={onDone} />
    </ScrollView>
  );
}

// ---- One session -----------------------------------------------------------------

function SessionView({ plan, spec, session: s, unitsKm, today, onBack, onStart, onDone, onSkip, onMove }: { plan: Plan; spec: PlanSpec; session: Session; unitsKm: boolean; today: number; onBack: () => void; onStart: () => void; onDone: () => void; onSkip: () => void; onMove: (date: number) => void }) {
  const paces = paceSetFor(plan.runner, plan.paces, spec.goal);
  const week = plan.weeks.find((w) => w.sessions.includes(s));
  const free = week ? [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(week.start, d)).filter((d) => d >= today && d !== s.date && !week.sessions.some((x) => x.date === d && x.kind !== 'strength')) : [];
  const [moving, setMoving] = useState(false);
  const open = !s.done && !s.skipped && s.kind !== 'strength';
  const heat = s.hard || s.kind === 'long' ? ui().train.onAHotDaySlow : null;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={ui().train.weekX(week?.index ?? '')} />
      <Text style={type.eyebrow}>
        {WEEKDAY_LONG[weekdayOf(s.date)]} · {formatDay(s.date)}
      </Text>
      <Text style={styles.h1}>{s.title}</Text>
      <Text style={styles.lede}>{s.summary}</Text>
      <Text style={styles.body}>{s.why}</Text>
      {s.note && <Text style={[styles.body, { color: colors.lilacDeep }]}>{s.note}</Text>}
      {s.done && (
        <Text style={[styles.body, { color: colors.mintDeep }]}>
          {s.done.distanceM > 0 || s.done.durationS > 0 ? ui().train.doneX(doneText(s.done, unitsKm)) : ui().train.doneTheRunItselfWas}
        </Text>
      )}
      {s.skipped && <Text style={[styles.body, { color: colors.muted }]}>{ui().train.skippedNothingLost}</Text>}

      {s.steps.length > 0 && (
        <Section title={ui().train.xMinAboutX(s.minutes, fmtKm(s.km, unitsKm))}>
          {s.steps.map((st, k) => (
            <StepRow key={k} step={st} pace={plan.paces ? paceFor(st.effort, paces) : null} unitsKm={unitsKm} />
          ))}
          {!plan.paces && s.hard && <Text style={styles.hint}>{ui().train.noPacesOnPurposeYou}</Text>}
          {heat && <Text style={styles.hint}>{heat}</Text>}
        </Section>
      )}

      {open && s.kind !== 'rest' && (planSessionOpen(plan, s.id) ? <Button title={s.date === today ? ui().train.startThisSession : s.date < today ? ui().train.doItTodayInstead : ui().train.startItNowAnyway} onPress={onStart} /> : <LockRow title={ui().train.guidedSessionsAfterWeek1} />)}
      {open && (
        <View style={styles.chips}>
          {free.length > 0 && <Chip label={moving ? ui().train.pickADay : ui().train.moveIt} on={moving} onPress={() => setMoving((v) => !v)} small />}
          <Chip label={ui().train.didItWithoutTheApp} onPress={() => Alert.alert(ui().train.markAsDone, ui().train.atThePlannedDistanceAnd, [{ text: ui().train.cancel, style: 'cancel' }, { text: ui().train.done, onPress: onDone }])} small />
          <Chip label={ui().train.skipIt} onPress={() => Alert.alert(ui().train.skipThisSession, ui().train.theWeekCarriesOnNothing, [{ text: ui().train.keep, style: 'cancel' }, { text: ui().train.skip, onPress: onSkip }])} small />
        </View>
      )}
      {open && moving && (
        <View style={styles.chips}>
          {free.map((d) => (
            <Chip key={d} label={`${WEEKDAY_SHORT[weekdayOf(d)]} ${new Date(d).getDate()}`} onPress={() => onMove(d)} small />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StepRow({ step, pace, unitsKm }: { step: Step; pace: number | null; unitsKm: boolean }) {
  const fill = step.kind === 'hard' ? colors.peach : step.kind === 'walk' ? colors.lilac : step.kind === 'stride' ? colors.butter : colors.mint;
  const size = step.durationS != null ? fmtDur(step.durationS, true) : step.distanceM != null ? fmtKm(step.distanceM / 1000, unitsKm) : '';
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: fill }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.stepLabel}>{step.label || EFFORT_LABEL[step.effort]}</Text>
        <Text style={styles.hint}>
          {size}
          {pace != null && step.effort !== 'walk' ? ui().train.aboutX(formatSPerKm(pace, unitsKm)) : ''}
        </Text>
      </View>
    </View>
  );
}

// ---- Away, ill, rules --------------------------------------------------------------

function AwayView({ today, onBack, onConfirm }: { today: number; onBack: () => void; onConfirm: (from: number, to: number) => void }) {
  const [from, setFrom] = useState(0);
  const [len, setLen] = useState(5);
  const a = addDays(today, from);
  const b = addDays(a, len - 1);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={ui().train.thisWeek} />
      <Text style={type.eyebrow}>{ui().train.away}</Text>
      <Text style={styles.h1}>{ui().train.plannedRestNotAMiss2}</Text>
      <Text style={styles.lede}>{ui().train.theRunsOnThoseDays}</Text>
      <Stepper label={ui().train.from} value={from} onChange={setFrom} min={0} max={90} step={1} format={(v) => (v === 0 ? ui().train.today : formatDay(addDays(today, v)))} />
      <Stepper label={ui().train.for} value={len} onChange={setLen} min={1} max={60} step={1} format={(v) => ui().train.daysBack(v, formatDay(addDays(b, 1)))} />
      <Button title={ui().train.awayXToX(formatDay(a), formatDay(b))} onPress={() => onConfirm(a, b)} />
    </ScrollView>
  );
}

function IllView({ onBack, onConfirm }: { onBack: () => void; onConfirm: (days: number) => void }) {
  const [days, setDays] = useState(3);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={ui().train.thisWeek} />
      <Text style={type.eyebrow}>{ui().train.ill}</Text>
      <Text style={styles.h1}>{ui().train.nothingUntilYouAreBetter}</Text>
      <Text style={styles.lede}>{ui().train.noRunningWithAFever}</Text>
      <Stepper label={ui().train.illForAbout} value={days} onChange={setDays} min={1} max={28} step={1} format={(v) => ui().common.days(v)} />
      <Text style={styles.hint}>{ui().train.aGuessIsFineIf}</Text>
      <Button title={ui().train.restThenEasy(days)} onPress={() => onConfirm(days)} />
    </ScrollView>
  );
}

function RulesView({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={ui().train.back} />
      <Text style={type.eyebrow}>{ui().train.theNineRules2}</Text>
      <Text style={styles.h1}>{ui().train.whatAPlanWillNever}</Text>
      <Text style={styles.lede}>{ui().train.everyPlanIsGeneratedThen}</Text>
      {RULES.map((r) => (
        <View key={r.n} style={styles.rule}>
          <Text style={styles.ruleN}>{r.n}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.ruleTitle}>{r.title}</Text>
            <Text style={styles.body}>{r.text}</Text>
            <Text style={styles.hint}>
              {r.evidence === 'strong' ? ui().train.strongEvidence : r.evidence === 'moderate' ? ui().train.moderateEvidence : ui().train.coachingPractice} · {r.source}
            </Text>
          </View>
        </View>
      ))}
      <Text style={styles.foot}>{ui().train.aPlanIsNotMedical}</Text>
    </ScrollView>
  );
}

// ---- Bits ----------------------------------------------------------------------------

function Back({ onPress, label }: { onPress: () => void; label: string }) {
  return <BackButton label={label} onPress={onPress} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, hint, onPress, danger }: { label: string; hint: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <Text style={[styles.rowLabel, danger && { color: colors.peachDeep }]}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format: (v: number) => string }) {
  return (
    <View style={styles.stepper}>
      {/* One adjustable control for screen readers: swipe up or down to change it. */}
      <View
        style={{ flex: 1 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(e.nativeEvent.actionName === 'increment' ? Math.min(max, value + step) : Math.max(min, value - step))}
      >
        <Text style={styles.stepperLabel}>{label}</Text>
        <Text style={styles.stepperValue}>{format(value)}</Text>
      </View>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn} accessibilityLabel={ui().train.lessX(label)}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn} accessibilityLabel={ui().train.moreX(label)}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const TIME_WORD: Record<string, string> = live(() => ui().train.timeWord);

function TimeBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <TextInput value={value} onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 2))} accessibilityLabel={TIME_WORD[label] ?? label} keyboardType="number-pad" placeholder="00" placeholderTextColor={colors.inkMuted} style={styles.timeBox} maxLength={2} />
      <Text style={styles.hint}>{ui().train.timeUnit[label] ?? label}</Text>
    </View>
  );
}

// ---- Words and numbers ---------------------------------------------------------

function fmtKm(km: number, unitsKm: boolean, digits = 1): string {
  return unitsKm ? `${decimal(km.toFixed(digits))} km` : `${decimal((km / KM_IN_MI).toFixed(digits))} mi`;
}

/** What a done session shows; a deleted run leaves only the tick. */
function doneText(done: NonNullable<Session['done']>, unitsKm: boolean): string {
  if (done.distanceM <= 0 && done.durationS <= 0) return ui().train.done;
  return ui().train.distanceIn(fmtKm(done.distanceM / 1000, unitsKm), fmtDur(done.durationS));
}

function fmtDur(s: number, short = false): string {
  const m = Math.round(s / 60);
  if (short) return s < 60 ? ui().common.sec(Math.round(s)) : s % 60 === 0 ? ui().common.min(m) : ui().train.xMinXS(Math.floor(s / 60), Math.round(s % 60));
  const h = Math.floor(m / 60);
  return h ? ui().train.xHXMin(h, String(m % 60).padStart(2, '0')) : ui().common.min(m);
}

function sizeOf(s: Session, spec: PlanSpec, unitsKm: boolean): string {
  if (s.kind === 'race') return `${fmtKm(s.km, unitsKm)}`;
  return spec.timeBased || s.kind === 'runwalk' ? ui().common.min(s.minutes) : ui().train.xMinX(s.minutes, fmtKm(s.km, unitsKm));
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function defaultLongDay(days: number[]): number {
  if (days.includes(0)) return 0;
  if (days.includes(6)) return 6;
  return days[days.length - 1] ?? 0;
}

function safePaces(distanceKm: number, timeS: number): Paces | null {
  const pace = timeS / distanceKm;
  if (pace < 150 || pace > 900) return null; // 2:30 to 15:00 per km: anything else is a typo
  try {
    return pacesFromRace(distanceKm, timeS);
  } catch {
    return null;
  }
}

function weekHeadline(week: Week, current: Week, today: number, raceIn: number | null): string {
  if (week.kind === 'race') return raceIn != null && raceIn >= 0 && week === current ? (raceIn === 0 ? ui().train.raceDay2 : ui().train.raceIn(raceIn)) : ui().train.raceWeek;
  if (week.kind === 'taper') return ui().train.taperLessNotSlower;
  if (week.kind === 'light') return ui().train.aLighterWeekOnPurpose;
  if (week.kind === 'peak') return ui().train.theBiggestWeek;
  if (week.kind === 'base') return ui().train.buildingTheBase;
  if (week.partial && week.start <= today) return ui().train.pickingUpFromHere;
  return ui().train.buildingSlowly;
}

function weekLede(week: Week, spec: PlanSpec, unitsKm: boolean): string {
  const runs = week.sessions.filter((s) => s.kind !== 'strength' && !s.skipped);
  const hard = runs.filter((s) => s.hard).length;
  const long = runs.find((s) => s.kind === 'long');
  const parts = [ui().common.runs(runs.length)];
  if (!spec.timeBased) parts.push(ui().train.about(fmtKm(week.targetKm, unitsKm, 0)));
  if (long) parts.push(ui().train.longRunX(spec.timeBased ? ui().common.min(long.minutes) : fmtKm(long.km, unitsKm)));
  parts.push(hard === 0 ? ui().train.nothingHard : hard === 1 ? ui().train.oneHarderDay : ui().train.xHarderDays(hard));
  return parts.join(' · ') + '.';
}

function missedTitle(m: MissedState): string {
  return m.kind === 'repeat' ? ui().train.xDaysWithoutARun(m.gapDays) : m.kind === 'stepback' ? ui().train.xDaysAway(m.gapDays) : ui().train.xDaysAFreshStart(m.gapDays);
}

function missedText(m: MissedState): string {
  if (m.kind === 'repeat') return ui().train.noCatchingUpTheLast;
  if (m.kind === 'stepback') return ui().train.fitnessKeepsBetterThanYou;
  return ui().train.afterAMonthOrMore;
}

function logLine(e: Plan['log'][number]): string {
  switch (e.kind) {
    case 'energy':
      return e.choice === 'rest' ? ui().train.lowEnergyRested : e.choice === 'easy' ? ui().train.lowEnergyMadeTheDay : ui().train.lowEnergyRanItAs;
    case 'pain':
      return e.level === 'pain' ? ui().train.painTwoDaysOffThen : e.level === 'niggle' ? ui().train.aNiggleNoted : ui().train.nothingHurt;
    case 'ill':
      return ui().train.illFor(e.days);
    case 'holiday':
      return ui().train.awayXToX2(formatDay(e.from), formatDay(e.to));
    case 'rebuilt':
      return e.reason;
    case 'paused':
      return ui().train.paused;
    case 'resumed':
      return ui().train.resumed;
    case 'stopped':
      return ui().train.stopped;
    case 'finished':
      return ui().train.finished;
  }
}

async function exportCalendar(plan: Plan) {
  try {
    const file = new File(Paths.cache, `runtrovert-${plan.setup.planId}.ics`);
    await file.write(planToIcs(plan));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: ui().train.addThePlanToA });
    } else {
      Alert.alert(ui().train.noWayToShareFrom, ui().train.theCalendarFileIsAt(file.uri));
    }
  } catch (e) {
    Alert.alert(ui().train.couldNotMakeTheCalendar, String(e));
  }
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: -10, marginRight: -10 },
  lockLine: { backgroundColor: '#ece5da', borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  lockLineText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  scroll: { flex: 1, backgroundColor: colors.cream },
  screen: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, color: colors.text },
  lede: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 23, color: colors.inkSoft },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  note: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.mintDeep },
  link: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  foot: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm },
  big: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 16, minHeight: 40, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  chipSmall: { minHeight: 36, paddingHorizontal: 13 },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  chipTextOn: { color: colors.cream },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.text, flex: 1 },
  cardBlurb: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  cardMeta: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
  cardFit: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink },
  section: { gap: spacing.sm, marginTop: spacing.xs },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, paddingLeft: 16 },
  stepperLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  stepperValue: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: 2 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lilacSoft, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.lilacDeep, marginTop: -2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, paddingLeft: 16 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.lilacSoft, padding: 3 },
  switchOn: { backgroundColor: colors.ink },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  knobOn: { marginLeft: 20 },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  timeBox: { width: 64, height: 52, borderRadius: radius.sm, backgroundColor: colors.white, textAlign: 'center', fontFamily: fonts.display, fontSize: 22, color: colors.text },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  previewDay: { width: 36, fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
  previewTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  previewSize: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  question: { gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
  warn: { backgroundColor: colors.peach, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  warnTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.peachDeep },
  progress: { height: 10, borderRadius: 5, backgroundColor: colors.white, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.mint },
  banner: { backgroundColor: colors.butter, borderRadius: radius.lg, padding: spacing.md, gap: 8 },
  bannerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.butterDeep },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { paddingVertical: 6 },
  navText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.inkSoft },
  days: { gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  dayRowToday: { backgroundColor: colors.ink },
  dayName: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  dayDate: { fontFamily: fonts.display, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  dayDot: { width: 10, height: 10, borderRadius: 5 },
  dayTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  daySub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  dayState: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  row: { paddingVertical: 10, gap: 2 },
  rowLabel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  stepLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  rule: { flexDirection: 'row', gap: 14, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
  ruleN: { fontFamily: fonts.display, fontSize: 26, color: colors.lilacDeep, width: 28 },
  ruleTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  today: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: 6, borderLeftWidth: 4, borderLeftColor: colors.butterDeep },
  todayQuiet: { borderLeftColor: colors.mint },
  todayLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.butterDeep },
  todayTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.text },
  todayNext: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.ink, marginTop: 4 },
  weekLede: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strip: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 68 },
  stripCol: { flex: 1, justifyContent: 'flex-end', height: 68 },
  stripBar: { borderRadius: 3, minWidth: 4 },
  stripShown: { borderWidth: 2, borderColor: colors.ink },
  stripFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  stripLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
});
