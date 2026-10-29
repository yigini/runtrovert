import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { previewLine, rescheduleReminders } from '../notify';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { CueMode, NotifyPerWeek } from '../types';

const CUES: Array<{ key: CueMode; label: string; hint: string }> = [
  { key: 'silent', label: 'Silent', hint: 'Nothing. Ever.' },
  { key: 'haptic', label: 'Haptic', hint: 'A short buzz at each km and lap.' },
  { key: 'voice', label: 'Voice', hint: 'One calm sentence per km. No cheering.' },
];

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const [preview, setPreview] = useState(previewLine());

  // Any change to the reminder settings re-lays the schedule.
  useEffect(() => {
    rescheduleReminders(settings);
  }, [settings.notifyPerWeek, settings.notifyHour, settings.notifyMinute]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      <Text style={styles.h1}>Settings</Text>

      <Section title="Cues" bg={colors.lilac} fg={colors.lilacDeep}>
        {CUES.map((c) => {
          const on = settings.cueMode === c.key;
          return (
            <Pressable key={c.key} onPress={() => update({ cueMode: c.key })} style={[styles.option, on && styles.optionOn]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{c.label}</Text>
                <Text style={[styles.optionHint, on && { color: colors.onInkMuted }]}>{c.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </Section>

      <Section title="Running" bg={colors.mint} fg={colors.mintDeep}>
        <Row label="Auto-pause" hint="Pause when you stop at a crossing; resume when you move.">
          <Switch value={settings.autoPause} onValueChange={(v) => update({ autoPause: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Row label="Countdown" hint="Seconds before the run starts.">
          <Segmented
            value={String(settings.countdownS)}
            options={['0', '3', '5', '10']}
            onChange={(v) => update({ countdownS: Number(v) })}
          />
        </Row>
        <Row label="Units">
          <Segmented value={settings.unitsKm ? 'km' : 'mi'} options={['km', 'mi']} onChange={(v) => update({ unitsKm: v === 'km' })} />
        </Row>
      </Section>

      <Section title="Quiet reminders" bg={colors.butter} fg={colors.butterDeep}>
        <Row label="Per week" hint="Short, dry, never a streak. Weekends left alone.">
          <Segmented
            value={String(settings.notifyPerWeek)}
            options={['0', '1', '3', '5']}
            onChange={(v) => update({ notifyPerWeek: Number(v) as NotifyPerWeek })}
          />
        </Row>
        <Row label="At" hint="Local time.">
          <Segmented
            value={String(settings.notifyHour)}
            options={['7', '8', '12', '17', '19']}
            onChange={(v) => update({ notifyHour: Number(v), notifyMinute: 0 })}
          />
        </Row>
        <Row label="After a run" hint="One quiet note a few minutes after you save.">
          <Switch value={settings.afterRunNote} onValueChange={(v) => update({ afterRunNote: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Pressable onPress={() => setPreview(previewLine())} style={styles.preview}>
          <Text style={styles.previewLabel}>Sounds like</Text>
          <Text style={styles.previewText}>{preview}</Text>
          <Text style={styles.previewHint}>tap for another</Text>
        </Pressable>
      </Section>

      <Section title="The sky" bg={colors.sky} fg={colors.skyDeep}>
        <Row label="Local weather on the home screen" hint="A location rounded to about 1 km goes to Open-Meteo and a forecast comes back. No key, no account, no cookies. Besides map tiles, it is the only thing the app fetches.">
          <Switch value={settings.weather} onValueChange={(v) => update({ weather: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title="Privacy" bg={colors.white} fg={colors.muted}>
        <Text style={styles.privacy}>
          Runtrovert has no server. Your runs, routes, notes and settings live only here. We can't see them even if we wanted to.
          Reminders are generated on the phone. Map tiles and the weather are the only things fetched, and the weather only if you leave it on. Delete the app and it's all gone.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, bg, fg, children }: { title: string; bg: string; fg: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: bg }]}>
      <Text style={[styles.sectionTitle, { color: fg }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.optionLabel}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.segItem, on && styles.segItemOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: spacing.md, paddingTop: spacing.lg },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  section: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm + 2 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5 },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14 },
  optionOn: { backgroundColor: colors.ink },
  optionLabel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  optionLabelOn: { color: colors.cream },
  optionHint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  check: { color: colors.cream, fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14 },
  seg: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.pill, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.pill },
  segItemOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  segTextOn: { color: colors.cream },
  privacy: { fontFamily: fonts.body, color: colors.text, fontSize: 14, lineHeight: 21 },
  preview: { backgroundColor: colors.cream, borderRadius: radius.md, padding: 14, gap: 4 },
  previewLabel: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  previewText: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  previewHint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, textAlign: 'right' },
});
