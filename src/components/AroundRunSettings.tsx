import React from 'react';
import { Switch } from 'react-native';
import { goalStore, tellStore } from '../extraStores';
import { BACK_IN } from '../tellSomeone';
import { GOAL_KM, GOAL_MI, GOAL_MINUTES } from '../weekGoal';
import { useSettings } from '../settings';
import { switchColors } from '../theme';
import { Group, Note, Row, Segmented } from './SettingsKit';
import { ui } from '../i18n/ui';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} {...switchColors(value)} />;
}

const MILE = 1609.344;

/** Settings > During a run: Tell someone. Off until switched on; the rest shows only then. */
export function TellSomeoneSettings() {
  const t = tellStore.use();
  if (!t) return null;
  const s = ui().tellSomeone;
  return (
    <Group title={s.title}>
      <Row label={s.show} hint={s.showHint}>
        <Toggle value={t.on} onChange={(on) => void tellStore.save({ on })} />
      </Row>
      {t.on ? (
        <>
          <Row label={s.backIn} stack>
            <Segmented value={String(t.minutes)} options={BACK_IN.map(String)} labels={Object.fromEntries(BACK_IN.map((m) => [String(m), s.minutes(m)]))} onChange={(v) => void tellStore.save({ minutes: Number(v) })} />
          </Row>
          <Row label={s.withPlace} hint={s.withPlaceHint}>
            <Toggle value={t.withPlace} onChange={(withPlace) => void tellStore.save({ withPlace })} />
          </Row>
        </>
      ) : null}
    </Group>
  );
}

/** Settings > Weather and extras: the weekly goal, then where to find the widgets. */
export function WeekGoalSettings() {
  const g = goalStore.use();
  const km = useSettings().settings.unitsKm;
  if (!g) return null;
  const w = ui().weekGoal;
  const dists = km ? GOAL_KM : GOAL_MI;
  const unit = km ? 1000 : MILE;
  const nearest = String(dists.reduce((a, b) => (Math.abs(b * unit - g.distanceM) < Math.abs(a * unit - g.distanceM) ? b : a)));
  return (
    <>
      <Group title={w.title}>
        <Row label={w.on} hint={w.hint}>
          <Toggle value={g.on} onChange={(on) => void goalStore.save({ on })} />
        </Row>
        {g.on ? (
          <>
            <Row label={w.count}>
              <Segmented value={g.kind} options={['time', 'distance']} labels={{ time: w.time, distance: w.distance }} onChange={(v) => void goalStore.save({ kind: v === 'distance' ? 'distance' : 'time' })} />
            </Row>
            <Row label={w.eachWeek} stack>
              {g.kind === 'time' ? (
                <Segmented value={String(g.minutes)} options={GOAL_MINUTES.map(String)} labels={Object.fromEntries(GOAL_MINUTES.map((m) => [String(m), w.minutes(m)]))} onChange={(v) => void goalStore.save({ minutes: Number(v) })} />
              ) : (
                <Segmented value={nearest} options={dists.map(String)} labels={Object.fromEntries(dists.map((d) => [String(d), `${d} ${km ? 'km' : 'mi'}`]))} onChange={(v) => void goalStore.save({ distanceM: Number(v) * unit })} />
              )}
            </Row>
          </>
        ) : null}
      </Group>
      {g.on ? <Note>{w.weekNote}</Note> : null}
    </>
  );
}

export function WidgetNote() {
  return (
    <Group title={ui().widget.settingTitle}>
      <Note>{ui().widget.settingHint}</Note>
    </Group>
  );
}
