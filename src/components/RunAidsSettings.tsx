import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { minSec, MILE_M } from '../geo';
import { ui } from '../i18n/ui';
import { cleanHeart, cleanPace, HEART_LIMITS, PACE_LIMITS, spokenFields, VOICE_FIELDS, type VoiceEvery, type VoiceField } from '../runAids';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, switchColors, themedStyles } from '../theme';
import type { Settings } from '../types';
import { Group, Note, Row, Segmented } from './SettingsKit';

/**
 * Settings > During a run > What the voice says, and > Pace and heart alerts.
 * Two small pages behind two rows, so the run page stays short.
 */

const EVERY: VoiceEvery[] = ['split', 'half', 'min5', 'min10'];

/** The row's value on the During a run page: "Each km · Distance, Pace, Total time". */
export function voiceSummary(s: Settings): string {
  const a = ui().runAids;
  const labels = a.fieldLabels;
  return a.voiceValue(a.everyLabels(s.unitsKm)[s.voiceEvery], spokenFields(s.voiceSays).map((f) => labels[f]).join(', '));
}

export function alertsSummary(s: Settings): string {
  const a = ui().runAids;
  const parts: string[] = [];
  if (s.paceAlert.on) {
    const p = cleanPace(s.paceAlert);
    parts.push(a.paceValue(paceText(p.fastS, s.unitsKm), paceText(p.slowS, s.unitsKm), s.unitsKm ? 'km' : 'mi'));
  }
  if (s.heartAlert.on) {
    const h = cleanHeart(s.heartAlert);
    parts.push(a.heartValue(h.low, h.high));
  }
  return parts.length ? parts.join(' · ') : a.off;
}

/** Seconds per km shown in the runner's unit. */
function paceText(secPerKm: number, km: boolean): string {
  return minSec(km ? secPerKm : secPerKm * (MILE_M / 1000));
}

function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label?: string; hint?: string }) {
  return <Switch value={value} onValueChange={onChange} accessibilityLabel={label} accessibilityHint={hint} {...switchColors(value)} />;
}

export function VoicePage() {
  const { settings, update } = useSettings();
  const a = ui().runAids;
  const picked = spokenFields(settings.voiceSays);
  const everyLabels = a.everyLabels(settings.unitsKm);
  function flip(f: VoiceField, on: boolean) {
    const next = VOICE_FIELDS.filter((x) => (x === f ? on : picked.includes(x)));
    // At least one number: an empty sentence would say nothing at all.
    if (next.length) update({ voiceSays: next });
  }
  return (
    <>
      {settings.cueMode !== 'voice' ? <Note strong>{a.voiceIsOff}</Note> : null}
      <Group title={a.howOften}>
        <Row stack label={a.howOften}>
          <Segmented value={settings.voiceEvery} options={EVERY} labels={everyLabels} onChange={(v) => update({ voiceEvery: v as VoiceEvery })} />
        </Row>
      </Group>
      <Group title={a.whatItSays}>
        {VOICE_FIELDS.map((f) => (
          <Row key={f} label={a.fieldLabels[f]} hint={f === 'heart' ? a.heartFieldHint : f === 'pace' ? a.paceFieldHint : undefined}>
            <Toggle value={picked.includes(f)} onChange={(v) => flip(f, v)} />
          </Row>
        ))}
      </Group>
      <Note>{a.voiceNote}</Note>
    </>
  );
}

export function AlertsPage() {
  const { settings, update } = useSettings();
  const a = ui().runAids;
  const km = settings.unitsKm;
  const unit = km ? 'km' : 'mi';
  const pace = cleanPace(settings.paceAlert);
  const heart = cleanHeart(settings.heartAlert);
  // One tap moves the shown pace by 5 seconds in the runner's unit.
  const paceStep = km ? PACE_LIMITS.step : PACE_LIMITS.step * (1000 / MILE_M);
  return (
    <>
      <Group title={a.paceTitle}>
        <Row label={a.paceToggle} hint={a.paceHint}>
          <Toggle value={pace.on} onChange={(on) => update({ paceAlert: { ...pace, on } })} />
        </Row>
        {pace.on ? (
          <>
            <Stepper
              label={a.quickerThan}
              value={`${paceText(pace.fastS, km)} /${unit}`}
              onLess={() => update({ paceAlert: cleanPace({ ...pace, fastS: pace.fastS - paceStep }) })}
              onMore={() => update({ paceAlert: cleanPace({ ...pace, fastS: pace.fastS + paceStep }) })}
            />
            <Stepper
              label={a.slowerThan}
              value={`${paceText(pace.slowS, km)} /${unit}`}
              onLess={() => update({ paceAlert: cleanPace({ ...pace, slowS: pace.slowS - paceStep }) })}
              onMore={() => update({ paceAlert: cleanPace({ ...pace, slowS: pace.slowS + paceStep }) })}
            />
          </>
        ) : null}
      </Group>
      <Group title={a.heartTitle}>
        <Row label={a.heartToggle} hint={a.heartHint}>
          <Toggle value={heart.on} onChange={(on) => update({ heartAlert: { ...heart, on } })} />
        </Row>
        {heart.on ? (
          <>
            <Stepper
              label={a.below}
              value={a.bpm(heart.low)}
              onLess={() => update({ heartAlert: cleanHeart({ ...heart, low: heart.low - HEART_LIMITS.step }) })}
              onMore={() => update({ heartAlert: cleanHeart({ ...heart, low: heart.low + HEART_LIMITS.step }) })}
            />
            <Stepper
              label={a.above}
              value={a.bpm(heart.high)}
              onLess={() => update({ heartAlert: cleanHeart({ ...heart, high: heart.high - HEART_LIMITS.step }) })}
              onMore={() => update({ heartAlert: cleanHeart({ ...heart, high: heart.high + HEART_LIMITS.step }) })}
            />
          </>
        ) : null}
      </Group>
      <Note>{a.alertsNote}</Note>
    </>
  );
}

/** A value with − and + either side. A screen reader hears "Quicker than, 5:00 /km" and two buttons. */
function Stepper({ label, value, onLess, onMore }: { label: string; value: string; onLess: () => void; onMore: () => void }) {
  const a = ui().runAids;
  return (
    <View style={styles.row}>
      <Text style={styles.label} accessibilityLabel={`${label}, ${value}`}>
        {label}
      </Text>
      <View style={styles.controls}>
        <Pressable onPress={onLess} accessibilityRole="button" accessibilityLabel={a.lessX(label)} hitSlop={6} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.btnText}>−</Text>
        </Pressable>
        <Text style={styles.value} importantForAccessibility="no">
          {value}
        </Text>
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={a.moreX(label)} hitSlop={6} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, paddingVertical: 10, paddingHorizontal: 14, minHeight: 52, gap: spacing.sm },
  label: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  btnText: { fontFamily: fonts.bodySemi, fontSize: 20, color: colors.text },
  value: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, minWidth: 84, textAlign: 'center', fontVariant: ['tabular-nums'] },
}));
