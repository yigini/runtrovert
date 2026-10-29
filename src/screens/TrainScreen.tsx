import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackButton } from '../components/BackButton';
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
import { UNLOCK_LINE, UNLOCK_PRICE, isUnlocked } from '../unlock';

/**
 * The Train tab. Without a plan: the catalogue, a plan's page, its setup and a
 * short health check. With one: this week, each session, and the ways a plan
 * gives way (away, ill, a gap, pause, stop). Nothing here needs an account.
 */

type Page =
  | { kind: 'catalogue' }
  | { kind: 'detail'; spec: PlanSpec }
  | { kind: 'locked'; spec: PlanSpec }
  | { kind: 'health'; spec: PlanSpec; setup: PlanSetup; runner: RunnerProfile; paces: Paces | null }
  | { kind: 'week'; index: number | null }
  | { kind: 'session'; id: string }
  | { kind: 'rules' }
  | { kind: 'how'; first: boolean }
  | { kind: 'away' }
  | { kind: 'ill' };

const TIER_LABEL: Record<Tier, string> = { start: 'First steps', keep: 'Ongoing', comeback: 'Come back', finish: 'Finish', improve: 'Improve', race: 'Race' };
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

  const reload = useCallback(async () => {
    const [p, prof, n, last] = await Promise.all([refreshPlan(), currentProfile(), historyCount(), lastRunAt()]);
    setPlan(p);
    setProfile(prof);
    setHistoryN(n);
    setLastRun(last);
    setView((v) => (p && p.status !== 'stopped' && p.status !== 'done' && (v.kind === 'catalogue' || v.kind === 'detail' || v.kind === 'health' || v.kind === 'locked') ? { kind: 'week', index: null } : v));
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
    if (view.kind === 'detail') return <DetailView spec={view.spec} profile={profile} historyN={historyN} unitsKm={settings.unitsKm} onBack={() => setView({ kind: 'catalogue' })} onRules={() => setView({ kind: 'rules' })} onStart={(setup, runner, paces) => setView(isUnlocked() ? { kind: 'health', spec: view.spec, setup, runner, paces } : { kind: 'locked', spec: view.spec })} />;
    if (view.kind === 'locked') return <LockedView spec={view.spec} onBack={() => setView({ kind: 'detail', spec: view.spec })} />;
    if (view.kind === 'health') {
      return (
        <HealthView
          onBack={() => setView({ kind: 'detail', spec: view.spec })}
          onStart={async () => {
            const made = createPlan(view.spec, view.setup, view.runner, view.paces);
            if (!made.ok) {
              Alert.alert('That does not fit', made.message);
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
          if (!r.ok) Alert.alert('Not that day', r.reason);
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
        if (!r.ok) Alert.alert('Could not rebuild', r.message);
        else await commit(r.plan);
      }}
      onPause={() => commit(setStatus(active, active.status === 'paused' ? 'active' : 'paused'))}
      onStop={() => {
        Alert.alert('Stop this plan?', 'The weeks stay in your history. You can start another any time.', [
          { text: 'Keep going', style: 'cancel' },
          {
            text: 'Stop plan',
            style: 'destructive',
            onPress: async () => {
              await commit(setStatus(active, 'stopped'));
              setView({ kind: 'catalogue' });
            },
          },
        ]);
      }}
      onCalendar={() => exportCalendar(active)}
    />
  );
}

// ---- Catalogue ------------------------------------------------------------------

function Catalogue({ profile, historyN, lastPlan, onPick, onRules }: { profile: RunnerProfile; historyN: number; lastPlan: Plan | null; onPick: (spec: PlanSpec) => void; onRules: () => void }) {
  const goals: Goal[] = ['none', '5k', '10k', 'half', 'marathon'];
  const [goal, setGoal] = useState<Goal>(lastPlan ? planById(lastPlan.setup.planId)?.goal ?? 'none' : 'none');
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Text style={type.eyebrow}>Train</Text>
      <Text style={styles.h1}>Structure,{'\n'}without the shouting.</Text>
      <Text style={styles.lede}>Fourteen plans, from a first run to a marathon. Every one follows nine rules, so you never run more than you can recover from, and every one gives way when life does.</Text>
      {lastPlan?.status === 'done' && <Text style={styles.note}>{lastPlan.name} is done. {planProgress(lastPlan).done} runs, {fmtKm(planProgress(lastPlan).kmDone, true)}. Quietly logged.</Text>}
      <View style={styles.chips}>
        {goals.map((g) => (
          <Chip key={g} label={GOAL_LABEL[g]} on={goal === g} onPress={() => setGoal(g)} />
        ))}
      </View>
      {plansFor(goal).map((spec) => (
        <PlanCard key={spec.id} spec={spec} profile={profile} historyN={historyN} onPress={() => onPick(spec)} />
      ))}
      <Pressable onPress={onRules} style={{ paddingVertical: spacing.sm }}>
        <Text style={styles.link}>The nine rules every plan keeps →</Text>
      </Pressable>
      <Text style={styles.foot}>No account, no server. A plan is a file on your phone.</Text>
    </ScrollView>
  );
}

function PlanCard({ spec, profile, historyN, onPress }: { spec: PlanSpec; profile: RunnerProfile; historyN: number; onPress: () => void }) {
  const gate = checkGate(spec, profile);
  const thin = historyN < 4;
  const days = spec.daysOptions.length > 1 ? `${spec.daysOptions[0]}–${spec.daysOptions[spec.daysOptions.length - 1]}` : `${spec.daysOptions[0]}`;
  const fit = thin ? (spec.gate.text ? `Expects ${lower(spec.gate.text)}` : 'No history needed.') : gate.ok ? 'Fits where you are now.' : `${gate.reason}${gate.bridge ? ` Start with ${planById(gate.bridge)?.name ?? gate.bridge}.` : ''}`;
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
        {spec.tier === 'keep' ? 'Ongoing' : `${spec.weeks} weeks`} · {days} {spec.daysOptions[spec.daysOptions.length - 1] > 1 ? 'runs' : 'run'} a week
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
      <Back onPress={onBack} label="All plans" />
      <Text style={type.eyebrow}>{GOAL_LABEL[spec.goal]} · {TIER_LABEL[spec.tier]}</Text>
      <Text style={styles.h1}>{spec.name}</Text>
      <Text style={styles.lede}>{spec.blurb}</Text>
      <Text style={styles.body}>
        {spec.tier === 'keep' ? 'Four weeks at a time, for as long as you like.' : `${spec.weeks} weeks.`} {spec.timeBased ? 'Measured in minutes, not kilometres.' : `Long runs up to ${fmtKm(spec.longCapKm ?? 0, unitsKm)}.`} {spec.qualityDays === 0 ? 'Nothing hard: easy running, with a few strides later on.' : spec.qualityDays === 1 ? 'One harder session a week from week three.' : 'Two harder sessions a week from week three.'}
      </Text>

      <Section title="Where you are">
        {thin ? (
          <>
            <Text style={styles.hint}>Fewer than four runs here in the last month, so say it yourself. Honest numbers make a safe plan.</Text>
            <Stepper label="Kilometres a week, lately" value={weekly} onChange={setWeekly} min={0} max={150} step={5} format={(v) => fmtKm(v, unitsKm, 0)} />
            <Stepper label="Longest run in the last month" value={longest} onChange={setLongest} min={0} max={45} step={1} format={(v) => fmtKm(v, unitsKm, 0)} />
          </>
        ) : (
          <Text style={styles.hint}>From your last four weeks: about {fmtKm(profile.weeklyKm, unitsKm, 0)} a week over {profile.runsPerWeek.toFixed(1)} runs, longest {fmtKm(profile.longestKm30, unitsKm)}.</Text>
        )}
        {!gate.ok && <Text style={[styles.hint, { color: colors.peachDeep }]}>{gate.reason}{gate.bridge ? ` ${planById(gate.bridge)?.name ?? ''} is the bridge to this one.` : ''}</Text>}
      </Section>

      <Section title="Runs a week">
        <View style={styles.chips}>
          {spec.daysOptions.map((n) => (
            <Chip key={n} label={String(n)} on={days === n} onPress={() => pickDays(n)} />
          ))}
        </View>
        <Text style={styles.hint}>Which days</Text>
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} on={runDays.includes(d)} onPress={() => toggleDay(d)} small />
          ))}
        </View>
        {!daysOk && <Text style={[styles.hint, { color: colors.peachDeep }]}>This plan runs {spec.daysOptions.join(' or ')} days a week.</Text>}
        <Text style={styles.hint}>Long run on</Text>
        <View style={styles.chips}>
          {runDays.map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} on={longDay === d} onPress={() => setLongDay(d)} small />
          ))}
        </View>
      </Section>

      {spec.raceKm != null && (
        <Section title="Race day">
          <Text style={styles.big}>{formatDay(raceDate)}</Text>
          <Text style={styles.hint}>{weeksToRace} weeks from now. The plan is {spec.weeks} weeks and shortens to {spec.minWeeks} at most.</Text>
          <View style={styles.chips}>
            <Chip label="− week" onPress={() => setRaceDate((d) => addDays(d, -7))} />
            <Chip label="+ week" onPress={() => setRaceDate((d) => addDays(d, 7))} />
            <Chip label="− day" onPress={() => setRaceDate((d) => addDays(d, -1))} />
            <Chip label="+ day" onPress={() => setRaceDate((d) => addDays(d, 1))} />
          </View>
        </Section>
      )}

      <Section title="Extra recovery">
        <Toggle value={extra} onChange={setExtra} label="A lighter week every third week instead of every fourth" hint="For over-50s, a return from injury, or a life that is already tiring." />
      </Section>

      {spec.qualityDays > 0 && (
        <Section title="A recent race, if you have one">
          <Text style={styles.hint}>Optional. Without it, every session is described by effort and the talk test. With it, each gets a pace too.</Text>
          <View style={styles.chips}>
            {[5, 10, 21.0975, 42.195].map((d) => (
              <Chip key={d} label={d === 5 ? '5K' : d === 10 ? '10K' : d < 22 ? 'Half' : 'Marathon'} on={raceKm === d} onPress={() => setRaceKm(raceKm === d ? null : d)} small />
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
            <Text style={styles.hint}>
              Easy {formatSPerKm(paces.easy[0], unitsKm)}–{formatSPerKm(paces.easy[1], unitsKm)} · threshold {formatSPerKm(paces.threshold, unitsKm)} · intervals {formatSPerKm(paces.interval, unitsKm)}. On that form, a {GOAL_LABEL[spec.goal === 'none' ? '10k' : spec.goal].toLowerCase()} in about {formatRaceTime(spec.goal === 'half' ? paces.predicted.half : spec.goal === 'marathon' ? paces.predicted.marathon : spec.goal === '5k' ? paces.predicted['5k'] : paces.predicted['10k'])}.
            </Text>
          )}
        </Section>
      )}

      <Section title="Week one">
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
              {spec.timeBased ? 'Run and walk, in minutes.' : `Week one about ${fmtKm(preview.weeks[0].targetKm, unitsKm, 0)}, peak week about ${fmtKm(preview.peakKm, unitsKm, 0)}.`} Every week is checked against the nine rules before you see it.
            </Text>
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.peachDeep }]}>{preview.message}</Text>
        )}
      </Section>

      <Pressable onPress={onRules} style={{ paddingVertical: spacing.xs }}>
        <Text style={styles.link}>The nine rules →</Text>
      </Pressable>
      <Button title={isUnlocked() ? 'Start this plan' : `Unlock plans · ${UNLOCK_PRICE}`} disabled={!preview.ok || !daysOk} onPress={() => onStart(setup, runner, paces)} />
      {!gate.ok && preview.ok && <Text style={styles.hint}>You can start anyway. The plan begins from the numbers above, not from where it would like you to be.</Text>}
    </ScrollView>
  );
}

function LockedView({ spec, onBack }: { spec: PlanSpec; onBack: () => void }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={spec.name} />
      <Text style={type.eyebrow}>Everything, once</Text>
      <Text style={styles.h1}>One price.{'\n'}No subscription.</Text>
      <Text style={styles.lede}>{UNLOCK_LINE}</Text>
      <Text style={styles.body}>All fourteen plans, guided sessions with cues, calendar export, and every plan that comes later. Pay once, keep it. Nothing is rented.</Text>
      <Button title={`Unlock · ${UNLOCK_PRICE}`} onPress={() => Alert.alert('Not in this build', 'Purchases are not wired up yet. Test builds have everything unlocked.')} />
    </ScrollView>
  );
}

// ---- Health check ----------------------------------------------------------------

const HEALTH_QUESTIONS = [
  'Has a doctor ever said you have a heart condition, or that you should only exercise under medical supervision?',
  'Do you feel pain in your chest when you exercise, or have you had chest pain at rest in the past month?',
  'Do you lose your balance because of dizziness, or have you lost consciousness in the past year?',
  'Do you have a bone, joint or tendon problem that running could make worse?',
  'Do you take medication for blood pressure, a heart condition or diabetes?',
  'Are you pregnant, or have you given birth in the last six months?',
  'Is there any other reason you should not run, or an injury from the last three months that still bothers you?',
];

function HealthView({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const [answers, setAnswers] = useState<Array<boolean | null>>(HEALTH_QUESTIONS.map(() => null));
  const anyYes = answers.some((a) => a === true);
  const complete = answers.every((a) => a !== null);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label="Setup" />
      <Text style={type.eyebrow}>Before the first week</Text>
      <Text style={styles.h1}>Seven questions.</Text>
      <Text style={styles.lede}>The ones a physio would ask. Only the date you answered is kept, never the answers.</Text>
      {HEALTH_QUESTIONS.map((q, i) => (
        <View key={q} style={styles.question}>
          <Text style={styles.body}>{q}</Text>
          <View style={styles.chips}>
            <Chip label="No" on={answers[i] === false} onPress={() => setAnswers((a) => a.map((x, j) => (j === i ? false : x)))} small />
            <Chip label="Yes" on={answers[i] === true} onPress={() => setAnswers((a) => a.map((x, j) => (j === i ? true : x)))} small />
          </View>
        </View>
      ))}
      {complete && anyYes && (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Talk to a doctor first.</Text>
          <Text style={styles.body}>A yes up there is a reason to check before a structured plan, not a reason never to run. Bring the questions along. The plan will wait.</Text>
        </View>
      )}
      <Button title={anyYes ? 'A doctor has cleared me. Start' : 'Start the plan'} disabled={!complete} onPress={onStart} />
      {complete && anyYes && <Button title="Not now" variant="secondary" onPress={onBack} />}
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
  const behind = missed.kind !== 'none' && plan.weeks.flatMap((w) => w.sessions).some((s) => s.date < today && !s.done && !s.skipped && s.kind !== 'strength');
  const raceIn = plan.setup.raceDate != null ? daysBetween(today, plan.setup.raceDate) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Text style={type.eyebrow}>
        {plan.name} · week {current.index} of {spec.tier === 'keep' ? '∞' : weeks[weeks.length - 1].index}
      </Text>
      <Text style={styles.h1}>{weekHeadline(current, current, today, raceIn)}</Text>

      {paused ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Paused.</Text>
          <Text style={styles.body}>Nothing counts as missed while it is. Resume when you like; a long pause gets a gentle restart.</Text>
        </View>
      ) : (
        <TodayCard plan={plan} spec={spec} today={today} unitsKm={unitsKm} onOpen={props.onOpen} onStart={props.onStart} />
      )}
      {!paused && behind && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{missedTitle(missed)}</Text>
          <Text style={styles.body}>{missedText(missed)}</Text>
          <View style={styles.chips}>
            <Chip label={missed.kind === 'repeat' ? 'Repeat last week' : 'Step back and rebuild'} on onPress={() => props.onRebuild(missed.kind === 'repeat' ? 'repeat' : 'stepback')} />
          </View>
        </View>
      )}

      <Section title={week === current ? 'This week' : `Week ${week.index}`}>
        <Text style={styles.weekLede}>{week === current ? weekLede(week, spec, unitsKm) : `${weekHeadline(week, current, today, raceIn)} ${weekLede(week, spec, unitsKm)}`}</Text>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.min(100, Math.round((prog.kmDone / Math.max(prog.kmTarget, 0.1)) * 100))}%` as `${number}%` }]} />
        </View>
        <Text style={styles.hint}>
          {prog.done} of {prog.total} runs · {fmtKm(prog.kmDone, unitsKm)} of {fmtKm(prog.kmTarget, unitsKm)}
        </Text>

        <View style={styles.weekNav}>
          <Pressable disabled={i <= 0} onPress={() => props.onWeek(weeks[i - 1].index)} style={[styles.navBtn, i <= 0 && { opacity: 0.3 }]} hitSlop={8}>
            <Text style={styles.navText}>‹ Week {i > 0 ? weeks[i - 1].index : ''}</Text>
          </Pressable>
          {week !== current && (
            <Pressable onPress={() => props.onWeek(current.index)} hitSlop={8}>
              <Text style={styles.link}>Back to this week</Text>
            </Pressable>
          )}
          <Pressable disabled={i >= weeks.length - 1} onPress={() => props.onWeek(weeks[i + 1].index)} style={[styles.navBtn, i >= weeks.length - 1 && { opacity: 0.3 }]} hitSlop={8}>
            <Text style={styles.navText}>Week {i < weeks.length - 1 ? weeks[i + 1].index : ''} ›</Text>
          </Pressable>
        </View>

        <View style={styles.days}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const date = addDays(week.start, d);
            const runs = week.sessions.filter((s) => s.date === date && s.kind !== 'strength');
            const strength = week.sessions.find((s) => s.date === date && s.kind === 'strength');
            const s = runs[0];
            return <DayRow key={date} date={date} today={today} session={s ?? null} strength={!!strength} spec={spec} unitsKm={unitsKm} onPress={s ? () => props.onOpen(s.id) : undefined} />;
          })}
        </View>
        <Legend />
        <Text style={styles.hint}>Tap a day for its steps, to move it within the week, or to skip it.</Text>
      </Section>

      <Section title="The whole plan">
        <WeekStrip weeks={weeks} current={current} shown={week} keep={spec.tier === 'keep'} onWeek={props.onWeek} />
        <Text style={styles.hint}>{planLine(plan, spec, current, total, today)}</Text>
      </Section>

      <Section title="Reminders">
        <PlanReminderCard paused={paused} />
      </Section>

      <Section title="When life happens">
        <Row label="How a plan works" hint="Today, this week, reminders, and what happens when you miss a day." onPress={props.onHow} />
        <Row label="Add the plan to a calendar" hint="An .ics file: Apple, Google, Outlook. Nothing syncs back." onPress={props.onCalendar} />
        <Row label="I’m away for a few days" hint="Planned rest, not a miss." onPress={props.onAway} />
        <Row label="I’m ill" hint="Rest until better, then as many easy days as you were ill." onPress={props.onIll} />
        <Row label={paused ? 'Resume the plan' : 'Pause the plan'} hint={paused ? 'Pick up from this week.' : 'Nothing is counted as missed while paused.'} onPress={props.onPause} />
        <Row label="The nine rules" hint="What the plan will never ask of you." onPress={props.onRules} />
        <Row label="Stop this plan" hint="The weeks stay in your history." onPress={props.onStop} danger />
      </Section>
      {plan.log.length > 0 && (
        <Section title="What changed along the way">
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
  const state = !s ? (strength ? 'Strength, optional' : 'Rest') : s.done ? 'Done' : s.skipped ? 'Skipped' : isToday ? 'Today' : past ? 'Missed' : '';
  const dot = !s ? colors.cream : s.kind === 'race' ? colors.peach : s.hard ? colors.peach : s.kind === 'long' ? colors.butter : colors.mint;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.dayRow, isToday && styles.dayRowToday, s?.skipped && { opacity: 0.55 }]}>
      <View style={{ width: 44 }}>
        <Text style={[styles.dayName, isToday && { color: colors.cream }]}>{WEEKDAY_SHORT[weekdayOf(date)]}</Text>
        <Text style={[styles.dayDate, isToday && { color: colors.onInkMuted }]}>{new Date(date).getDate()}</Text>
      </View>
      <View style={[styles.dayDot, { backgroundColor: dot }, !s && { borderWidth: 1, borderColor: colors.lilac }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.dayTitle, isToday && { color: colors.cream }, s?.skipped && { textDecorationLine: 'line-through' }]} numberOfLines={1}>
          {s ? s.title : strength ? 'Strength, if you like' : 'Rest'}
        </Text>
        {s && (
          <Text style={[styles.daySub, isToday && { color: colors.onInkMuted }]} numberOfLines={1}>
            {s.done ? `${fmtKm(s.done.distanceM / 1000, unitsKm)} in ${fmtDur(s.done.durationS)}` : sizeOf(s, spec, unitsKm)}
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
  const nextLine = next ? `Next: ${WEEKDAY_LONG[weekdayOf(next.date)]}${daysBetween(today, next.date) > 6 ? ` ${new Date(next.date).getDate()}` : ''}, ${lower(next.title)} · ${sizeOf(next, spec, unitsKm)}.` : 'That was the last session of the plan.';
  const notStarted = today < plan.weeks[0].start || (!s && runSessions(plan).every((x) => x.date > today && !x.done));

  if (s && !s.done && !s.skipped) {
    return (
      <View style={styles.today}>
        <Text style={styles.todayLabel}>Today</Text>
        <Text style={styles.todayTitle}>{s.title}</Text>
        <Text style={styles.body}>{s.summary}</Text>
        <Text style={styles.hint}>
          {sizeOf(s, spec, unitsKm)} · {s.hard ? 'a harder day' : s.kind === 'long' ? 'the long run, slow' : 'easy, you can talk the whole way'}
        </Text>
        <Button title="Start today’s session" onPress={() => onStart(s)} style={{ marginTop: 6 }} />
        <Pressable onPress={() => onOpen(s.id)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 4 }}>
          <Text style={styles.link}>See the steps, move or skip it</Text>
        </Pressable>
        <Text style={styles.hint}>Any run today counts for it, even one started from the Run tab.</Text>
      </View>
    );
  }
  const title = s?.done ? 'Done for today.' : s?.skipped ? 'Set aside today.' : notStarted ? 'The plan starts soon.' : 'Rest today.';
  const text = s?.done
    ? `${fmtKm(s.done.distanceM / 1000, unitsKm)} in ${fmtDur(s.done.durationS)}. Logged against the plan.`
    : s?.skipped
      ? 'Nothing lost, and nothing added elsewhere to make up for it.'
      : notStarted
        ? 'Nothing to do until the first session.'
        : 'Rest is part of the plan, not a gap in it. A walk is fine.';
  return (
    <View style={[styles.today, styles.todayQuiet]}>
      <Text style={styles.todayLabel}>Today</Text>
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
    [colors.mint, 'Easy'],
    [colors.butter, 'Long'],
    [colors.peach, 'Harder'],
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
        <Text style={styles.hint}>Rest</Text>
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
            <Pressable key={w.index} onPress={() => onWeek(w.index)} style={styles.stripCol} accessibilityLabel={`Week ${w.index}`} hitSlop={4}>
              <View style={[styles.stripBar, { height: 8 + Math.round((w.targetKm / max) * 56), backgroundColor: fill }, w === shown && w !== current && styles.stripShown]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.stripFoot}>
        <Text style={styles.stripLabel}>Week {weeks[0].index}</Text>
        <Text style={styles.stripLabel}>{keep ? 'then four more' : weeks[weeks.length - 1].kind === 'race' ? 'Race' : `Week ${weeks[weeks.length - 1].index}`}</Text>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, { backgroundColor: colors.ink }]} />
          <Text style={styles.hint}>Now</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, { backgroundColor: colors.lilac }]} />
          <Text style={styles.hint}>Lighter week</Text>
        </View>
        {weeks.some((w) => w.kind === 'taper' || w.kind === 'race') && (
          <View style={styles.legendItem}>
            <View style={[styles.dayDot, { backgroundColor: colors.peach }]} />
            <Text style={styles.hint}>Taper and race</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function planLine(plan: Plan, spec: PlanSpec, current: Week, total: { done: number; total: number }, today: number): string {
  const end = plan.setup.raceDate ?? planEnd(plan);
  const left = Math.max(0, daysBetween(today, end));
  const when = plan.setup.raceDate != null ? `Race on ${formatDay(plan.setup.raceDate)}, ${left} ${left === 1 ? 'day' : 'days'} away.` : spec.tier === 'keep' ? 'A new block of four weeks follows this one.' : `Ends ${formatDay(end)}.`;
  return `${total.done} of ${total.total} runs done. ${when} Taller bars are bigger weeks; tap one to look ahead.`;
}

// ---- How a plan works --------------------------------------------------------------

function HowView({ plan, spec, first, onDone }: { plan: Plan; spec: PlanSpec; first: boolean; onDone: () => void }) {
  const light = plan.setup.extraRecovery ? 'third' : 'fourth';
  const points: Array<[string, string]> = [
    ['Today', 'Each day has one thing: a session or rest. It sits at the top of Train and on the Run screen, where the button becomes “Start today’s session” and talks you through the steps, screen off too.'],
    ['This week', `${plan.setup.daysPerWeek} runs, on the days you picked. Green is easy, yellow is the long run, peach is harder. Tap a day to see the steps, move it to a free day in the same week, or skip it.`],
    [spec.tier === 'keep' ? 'The blocks' : 'The plan', `The weeks build slowly, with a lighter one every ${light}${plan.setup.raceDate != null ? ' and a taper before the race' : ''}. Any run you do on a plan day counts for it.`],
    ['When you miss days', 'Nothing is doubled up to catch up. A missed day stays missed; a week or more away and the plan repeats a week or steps back. Away, ill or pause, below the week.'],
  ];
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      {!first && <Back onPress={onDone} label="This week" />}
      <Text style={type.eyebrow}>{first ? plan.name : 'How a plan works'}</Text>
      <Text style={styles.h1}>{first ? 'Your plan is set.\nHere is how it goes.' : 'Four things,\nthen just run.'}</Text>
      {points.map(([t, b], k) => (
        <View key={t} style={styles.rule}>
          <Text style={styles.ruleN}>{k + 1}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.ruleTitle}>{t}</Text>
            <Text style={styles.body}>{b}</Text>
          </View>
        </View>
      ))}
      <Section title="Reminders">
        <PlanReminderCard paused={plan.status === 'paused'} />
      </Section>
      <Button title={first ? 'See this week' : 'Back to this week'} onPress={onDone} />
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
  const heat = s.hard || s.kind === 'long' ? 'Hot day: slow down, or move it. The plan is about the effort, not the number.' : null;
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label={`Week ${week?.index ?? ''}`} />
      <Text style={type.eyebrow}>
        {WEEKDAY_LONG[weekdayOf(s.date)]} · {formatDay(s.date)}
      </Text>
      <Text style={styles.h1}>{s.title}</Text>
      <Text style={styles.lede}>{s.summary}</Text>
      <Text style={styles.body}>{s.why}</Text>
      {s.note && <Text style={[styles.body, { color: colors.lilacDeep }]}>{s.note}</Text>}
      {s.done && (
        <Text style={[styles.body, { color: colors.mintDeep }]}>
          Done: {fmtKm(s.done.distanceM / 1000, unitsKm)} in {fmtDur(s.done.durationS)}.
        </Text>
      )}
      {s.skipped && <Text style={[styles.body, { color: colors.muted }]}>Skipped. Nothing lost.</Text>}

      {s.steps.length > 0 && (
        <Section title={`${s.minutes} min · about ${fmtKm(s.km, unitsKm)}`}>
          {s.steps.map((st, k) => (
            <StepRow key={k} step={st} pace={plan.paces ? paceFor(st.effort, paces) : null} unitsKm={unitsKm} />
          ))}
          {!plan.paces && s.hard && <Text style={styles.hint}>No paces, on purpose: you did not give a race time. The talk test is the measure.</Text>}
          {heat && <Text style={styles.hint}>{heat}</Text>}
        </Section>
      )}

      {open && s.kind !== 'rest' && <Button title={s.date === today ? 'Start this session' : s.date < today ? 'Do it today instead' : 'Start it now anyway'} onPress={onStart} />}
      {open && (
        <View style={styles.chips}>
          {free.length > 0 && <Chip label={moving ? 'Pick a day' : 'Move it'} on={moving} onPress={() => setMoving((v) => !v)} small />}
          <Chip label="Did it without the app" onPress={() => Alert.alert('Mark as done?', 'At the planned distance and time.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Done', onPress: onDone }])} small />
          <Chip label="Skip it" onPress={() => Alert.alert('Skip this session?', 'The week carries on. Nothing is added elsewhere.', [{ text: 'Keep', style: 'cancel' }, { text: 'Skip', onPress: onSkip }])} small />
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
          {pace != null && step.effort !== 'walk' ? ` · about ${formatSPerKm(pace, unitsKm)}` : ''}
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
      <Back onPress={onBack} label="This week" />
      <Text style={type.eyebrow}>Away</Text>
      <Text style={styles.h1}>Planned rest,{'\n'}not a miss.</Text>
      <Text style={styles.lede}>The runs on those days are set aside. Two weeks or more away and the plan comes back at 60% and builds up again.</Text>
      <Stepper label="From" value={from} onChange={setFrom} min={0} max={90} step={1} format={(v) => (v === 0 ? 'Today' : formatDay(addDays(today, v)))} />
      <Stepper label="For" value={len} onChange={setLen} min={1} max={60} step={1} format={(v) => `${v} ${v === 1 ? 'day' : 'days'} · back ${formatDay(addDays(b, 1))}`} />
      <Button title={`Away ${formatDay(a)} to ${formatDay(b)}`} onPress={() => onConfirm(a, b)} />
    </ScrollView>
  );
}

function IllView({ onBack, onConfirm }: { onBack: () => void; onConfirm: (days: number) => void }) {
  const [days, setDays] = useState(3);
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label="This week" />
      <Text style={type.eyebrow}>Ill</Text>
      <Text style={styles.h1}>Nothing until{'\n'}you are better.</Text>
      <Text style={styles.lede}>No running with a fever or anything in the chest. Then as many easy days as you were ill, and the plan starts again from where it was. A fortnight or more, and it steps back to 60%.</Text>
      <Stepper label="Ill for about" value={days} onChange={setDays} min={1} max={28} step={1} format={(v) => `${v} ${v === 1 ? 'day' : 'days'}`} />
      <Text style={styles.hint}>A guess is fine. If it runs longer, come back here.</Text>
      <Button title={`Rest ${days} ${days === 1 ? 'day' : 'days'}, then easy`} onPress={() => onConfirm(days)} />
    </ScrollView>
  );
}

function RulesView({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.screen}>
      <Back onPress={onBack} label="Back" />
      <Text style={type.eyebrow}>The nine rules</Text>
      <Text style={styles.h1}>What a plan{'\n'}will never ask.</Text>
      <Text style={styles.lede}>Every plan is generated, then checked against these before you see it. Every change along the way goes through the same checks.</Text>
      {RULES.map((r) => (
        <View key={r.n} style={styles.rule}>
          <Text style={styles.ruleN}>{r.n}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.ruleTitle}>{r.title}</Text>
            <Text style={styles.body}>{r.text}</Text>
            <Text style={styles.hint}>
              {r.evidence === 'strong' ? 'Strong evidence' : r.evidence === 'moderate' ? 'Moderate evidence' : 'Coaching practice'} · {r.source}
            </Text>
          </View>
        </View>
      ))}
      <Text style={styles.foot}>A plan is not medical advice. Pain that changes how you run is a reason to stop and ask someone who can look at you.</Text>
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
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: !!on }} style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}>
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
      <View style={{ flex: 1 }}>
        <Text style={styles.stepperLabel}>{label}</Text>
        <Text style={styles.stepperValue}>{format(value)}</Text>
      </View>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn} accessibilityLabel={`Less ${label}`}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn} accessibilityLabel={`More ${label}`}>
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

function TimeBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <TextInput value={value} onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="00" placeholderTextColor={colors.inkMuted} style={styles.timeBox} maxLength={2} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

// ---- Words and numbers ---------------------------------------------------------

function fmtKm(km: number, unitsKm: boolean, digits = 1): string {
  return unitsKm ? `${km.toFixed(digits)} km` : `${(km / KM_IN_MI).toFixed(digits)} mi`;
}

function fmtDur(s: number, short = false): string {
  const m = Math.round(s / 60);
  if (short) return s < 60 ? `${Math.round(s)} s` : s % 60 === 0 ? `${m} min` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

function sizeOf(s: Session, spec: PlanSpec, unitsKm: boolean): string {
  if (s.kind === 'race') return `${fmtKm(s.km, unitsKm)}`;
  return spec.timeBased || s.kind === 'runwalk' ? `${s.minutes} min` : `${s.minutes} min · ${fmtKm(s.km, unitsKm)}`;
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
  if (week.kind === 'race') return raceIn != null && raceIn >= 0 && week === current ? (raceIn === 0 ? 'Race day.' : `Race in ${raceIn} ${raceIn === 1 ? 'day' : 'days'}.`) : 'Race week.';
  if (week.kind === 'taper') return 'Taper. Less, not slower.';
  if (week.kind === 'light') return 'A lighter week. On purpose.';
  if (week.kind === 'peak') return 'The biggest week.';
  if (week.kind === 'base') return 'Building the base.';
  if (week.partial && week.start <= today) return 'Picking up from here.';
  return 'Building, slowly.';
}

function weekLede(week: Week, spec: PlanSpec, unitsKm: boolean): string {
  const runs = week.sessions.filter((s) => s.kind !== 'strength' && !s.skipped);
  const hard = runs.filter((s) => s.hard).length;
  const long = runs.find((s) => s.kind === 'long');
  const parts = [`${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`];
  if (!spec.timeBased) parts.push(`about ${fmtKm(week.targetKm, unitsKm, 0)}`);
  if (long) parts.push(`long run ${spec.timeBased ? `${long.minutes} min` : fmtKm(long.km, unitsKm)}`);
  parts.push(hard === 0 ? 'nothing hard' : hard === 1 ? 'one harder day' : `${hard} harder days`);
  return parts.join(' · ') + '.';
}

function missedTitle(m: MissedState): string {
  return m.kind === 'repeat' ? `${m.gapDays} days without a run.` : m.kind === 'stepback' ? `${m.gapDays} days away.` : `${m.gapDays} days. A fresh start.`;
}

function missedText(m: MissedState): string {
  if (m.kind === 'repeat') return 'No catching up. The last completed week is repeated, then the plan carries on as it was.';
  if (m.kind === 'stepback') return 'Fitness keeps better than you fear. The plan steps back to 60% of where it was and builds up again, no hard sessions for two weeks.';
  return 'After a month or more, the plan steps back to 60% and goes gently. If it was illness or injury, Come back may suit better: stop this plan and pick it from the catalogue.';
}

function logLine(e: Plan['log'][number]): string {
  switch (e.kind) {
    case 'energy':
      return e.choice === 'rest' ? 'Low energy: rested.' : e.choice === 'easy' ? 'Low energy: made the day easy.' : 'Low energy: ran it as planned.';
    case 'pain':
      return e.level === 'pain' ? 'Pain: two days off, then easy.' : e.level === 'niggle' ? 'A niggle, noted.' : 'Nothing hurt.';
    case 'ill':
      return `Ill for ${e.days} ${e.days === 1 ? 'day' : 'days'}.`;
    case 'holiday':
      return `Away ${formatDay(e.from)} to ${formatDay(e.to)}.`;
    case 'rebuilt':
      return e.reason;
    case 'paused':
      return 'Paused.';
    case 'resumed':
      return 'Resumed.';
    case 'stopped':
      return 'Stopped.';
    case 'finished':
      return 'Finished.';
  }
}

async function exportCalendar(plan: Plan) {
  try {
    const file = new File(Paths.cache, `runtrovert-${plan.setup.planId}.ics`);
    await file.write(planToIcs(plan));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle: 'Add the plan to a calendar' });
    } else {
      Alert.alert('No way to share from here', `The calendar file is at ${file.uri}.`);
    }
  } catch (e) {
    Alert.alert('Could not make the calendar file', String(e));
  }
}

const styles = StyleSheet.create({
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
  chip: { paddingHorizontal: 16, height: 40, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  chipSmall: { height: 36, paddingHorizontal: 13 },
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
