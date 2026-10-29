import React, { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { PresetSheet } from '../components/PresetSheet';
import { appByKey } from '../music';
import { notificationStatus, previewLine, sendLineNow, turnOnNotifications, type NotifyStatus } from '../notify';
import { presetInfo } from '../presets';
import { PODCAST_APPS } from '../shelfLogic';
import { onBatteryModeChanged } from '../tracking';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { BatteryMode, CueMode, ListenDownload, NotifyPerWeek } from '../types';

const BATTERY: Array<{ key: BatteryMode; label: string; hint: string }> = [
  { key: 'auto', label: 'Auto', hint: 'Full GPS until the battery drops to 25% or the phone is in low-power mode, then eases off.' },
  { key: 'best', label: 'Best accuracy', hint: 'A fix every second. Most precise splits, most battery.' },
  { key: 'saver', label: 'Saver', hint: 'A fix every few seconds. Distance stays within about 1% on steady runs.' },
];

const CUES: Array<{ key: CueMode; label: string; hint: string }> = [
  { key: 'silent', label: 'Silent', hint: 'Nothing. Ever.' },
  { key: 'haptic', label: 'Haptic', hint: 'A short buzz at each km and lap.' },
  { key: 'voice', label: 'Voice', hint: 'One calm sentence per km. No cheering.' },
];

export function SettingsScreen({ onOpenListen, onBack }: { onOpenListen: () => void; onBack?: () => void }) {
  const { settings, update } = useSettings();
  const [presets, setPresets] = useState(false);
  const preset = settings.runPreset ? presetInfo(settings.runPreset) : null;
  const [preview, setPreview] = useState(previewLine());

  const [status, setStatus] = useState<NotifyStatus>('granted');
  // App.tsx re-plans reminders when these settings change. Here we only keep the
  // permission line honest, including after a trip to the phone's settings.
  useEffect(() => {
    const check = () => notificationStatus().then(setStatus).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);
  useEffect(() => {
    onBatteryModeChanged();
  }, [settings.batteryMode]);

  async function onSendNow() {
    const ok = await sendLineNow();
    setStatus(await notificationStatus());
    if (ok) Alert.alert('On its way', 'Lock your phone. One arrives in five seconds, the way they will on a Tuesday morning.');
    else Alert.alert('Notifications are off', 'Turn on notifications for Runtrovert in your phone settings to get reminders and run notes.');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      {onBack ? <BackButton label="Back" onPress={onBack} /> : null}
      <Text style={styles.h1} accessibilityRole="header">Settings</Text>

      <Section title="Today's run" bg={colors.lilac} fg={colors.lilacDeep}>
        <Pressable onPress={() => setPresets(true)} accessibilityRole="button" accessibilityHint="Shows the three presets and what each one brings" style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>What each preset shows</Text>
            <Text style={styles.optionHint}>{preset ? `Picked: ${preset.name}. ` : ''}Clear my head, Just run, Follow my plan. Pick one on the Run tab.</Text>
          </View>
          <Text style={styles.chev} importantForAccessibility="no">›</Text>
        </Pressable>
      </Section>

      <Section title="Cues" bg={colors.lilac} fg={colors.lilacDeep}>
        {CUES.map((c) => {
          const on = settings.cueMode === c.key;
          return (
            <Pressable key={c.key} onPress={() => update({ cueMode: c.key })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${c.label}. ${c.hint}`} style={[styles.option, on && styles.optionOn]}>
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
        <Row label="Lock screen and watch" hint="Live distance and time on the lock screen, a short note at each km. Wear OS and Apple Watch show them too.">
          <Switch value={settings.runNotes} onValueChange={(v) => update({ runNotes: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Row label="Units">
          <Segmented value={settings.unitsKm ? 'km' : 'mi'} options={['km', 'mi']} onChange={(v) => update({ unitsKm: v === 'km' })} />
        </Row>
      </Section>

      <Section title="Music & podcasts" bg={colors.lilac} fg={colors.lilacDeep}>
        <Text style={styles.musicNote}>
          {appByKey(settings.musicApp)?.name ?? "Phone's default"} for music, {PODCAST_APPS.find((a) => a.key === settings.podcastApp)?.label ?? 'ask each time'} for
          podcasts, music strip {settings.musicStrip ? 'on' : 'off'} during runs. All of it lives in Listen, the lilac button beside Start, where you can try the controls.
        </Text>
        <Pressable onPress={onOpenListen} accessibilityRole="button" style={[styles.option, styles.optionOn, { alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, styles.optionLabelOn]}>Open Listen</Text>
        </Pressable>
      </Section>

      <Section title="Battery" bg={colors.sky} fg={colors.skyDeep}>
        {BATTERY.map((b) => {
          const on = settings.batteryMode === b.key;
          return (
            <Pressable key={b.key} onPress={() => update({ batteryMode: b.key })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${b.label}. ${b.hint}`} style={[styles.option, on && styles.optionOn]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{b.label}</Text>
                <Text style={[styles.optionHint, on && { color: colors.onInkMuted }]}>{b.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        <Row label="Keep screen on" hint="Only during a run. Costs a lot of battery; the lock screen shows your numbers anyway.">
          <Switch value={settings.keepScreenOn} onValueChange={(v) => update({ keepScreenOn: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title="Quiet reminders" bg={colors.butter} fg={colors.butterDeep}>
        {status !== 'granted' ? (
          <Row label="Notifications are off" hint="So no reminders and no lock-screen numbers during runs. Your call, and nothing else changes.">
            <Pressable
              onPress={async () => {
                await turnOnNotifications();
                setStatus(await notificationStatus());
              }}
              style={styles.turnOn}
              accessibilityRole="button"
              accessibilityLabel="Turn on notifications"
            >
              <Text style={styles.turnOnText}>Turn on</Text>
            </Pressable>
          </Row>
        ) : null}
        <Text style={styles.promise}>
          The deal: never more than you pick here, one a day at most, nothing between 9 pm and 7 am, never a streak or a sound. Each one has a “Fewer, please” button.
        </Text>
        <Row label="Per week" hint="Short, dry, never a streak. Skips days you’ve already run, eases off if ignored. With a training plan, the plan takes over: a note on plan days with the session, nothing on rest days.">
          <Segmented
            value={String(settings.notifyPerWeek)}
            options={['0', '1', '3', '5']}
            onChange={(v) => update({ notifyPerWeek: Number(v) as NotifyPerWeek })}
          />
        </Row>
        <Row stack label="At" hint={settings.notifyAuto ? 'Auto: about 45 minutes before you usually run, on the days you usually run. 8:00 on Mon, Wed, Fri until there are a few runs to go on.' : 'Local time, on weekdays.'}>
          <Segmented
            value={settings.notifyAuto ? 'Auto' : String(settings.notifyHour)}
            options={['Auto', '7', '8', '12', '17', '19']}
            onChange={(v) => (v === 'Auto' ? update({ notifyAuto: true }) : update({ notifyAuto: false, notifyHour: Number(v), notifyMinute: 0 }))}
          />
        </Row>
        <Row label="After a run" hint="One quiet note fifteen minutes after you save, or a nudge to log your energy if you skipped it. Never after 21:00.">
          <Switch value={settings.afterRunNote} onValueChange={(v) => update({ afterRunNote: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Pressable onPress={() => setPreview(previewLine())} style={styles.preview} accessibilityRole="button" accessibilityLabel={`Sounds like: ${preview}`} accessibilityHint="Shows another example">
          <Text style={styles.previewLabel}>Sounds like</Text>
          <Text style={styles.previewText}>{preview}</Text>
          <Text style={styles.previewHint}>tap for another</Text>
        </Pressable>
        <Pressable onPress={onSendNow} style={styles.sendNow} accessibilityRole="button">
          <Text style={styles.sendNowText}>Send me one now</Text>
        </Pressable>
      </Section>

      <Section title="Map" bg={colors.mint} fg={colors.mintDeep}>
        <Row
          label="Plain map"
          hint="Your route, the live dot and the zoom work the same on a plain ground. No streets or names, and nothing is fetched. Off, the streets come from OpenFreeMap, which sees the area on screen and your IP address."
        >
          <Switch value={settings.plainMap} onValueChange={(v) => update({ plainMap: v, mapNoticeSeen: true })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title="The sky" bg={colors.sky} fg={colors.skyDeep}>
        <Row label="Local weather on the home screen" hint="A location rounded to about 1 km goes to Open-Meteo and a forecast comes back. No key, no account, no cookies. Besides map tiles and the Listen list, it is the only thing the app fetches.">
          <Switch value={settings.weather} onValueChange={(v) => update({ weather: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title="Listen" bg={colors.butter} fg={colors.butterDeep}>
        <Row label="Daily list" hint="When you open Listen, download today's shows, episodes and covers from GitHub. One file, the same for everyone, so the request says nothing about you; GitHub sees normal connection details such as your IP address.">
          <Segmented
            value={{ ask: 'Ask', on: 'On', off: 'Off' }[settings.listenDownload]}
            options={['Ask', 'On', 'Off']}
            onChange={(v) => update({ listenDownload: v.toLowerCase() as ListenDownload })}
          />
        </Row>
        <Row label="Kit & offers" hint="A shelf of running kit from paying sponsors, at the bottom of Listen. Only there, only when you open it. Off hides it for good.">
          <Switch value={!settings.offersHidden} onValueChange={(v) => update({ offersHidden: !v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title="Privacy" bg={colors.white} fg={colors.muted}>
        <Text style={styles.privacy}>
          Runtrovert has no server. Your runs, routes, notes and settings are saved on this phone, and in the phone's own backup to your Google or Apple
          account if you have backups on. We can't see them even if we wanted to. Reminders are written and scheduled on the phone. No push service, no
          server, nothing that knows when or whether you ran. The app fetches three things: map tiles unless you chose Plain map, the weather if you leave it
          on, and the Listen list if you said yes, which is one file that's the same for everyone. Like any website, each of those sees your IP address. The
          map service also sees which area is on screen, and the weather service a location rounded to about 1 km. Your route itself is never sent. Podcasts
          play in your own podcast app; we never see what you play. Sponsors pay a flat fee for a place on the Kit & offers shelf and never learn who opened
          it or what was tapped. Delete the app and it's gone from this phone; a phone backup keeps a copy until it's replaced.
        </Text>
      </Section>
      <PresetSheet open={presets} value={settings.runPreset ?? 'just'} onPick={(p) => update({ runPreset: p })} onClose={() => setPresets(false)} />
    </ScrollView>
  );
}

function Section({ title, bg, fg, children }: { title: string; bg: string; fg: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: bg }]}>
      <Text style={[styles.sectionTitle, { color: fg }]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

/**
 * A setting and its control. The control is handed the row's words, so a
 * screen reader says "Auto-pause, switch, on" rather than just "switch, on".
 * The words themselves are hidden from it to avoid reading them twice.
 */
function Row({ label, hint, stack, children }: { label: string; hint?: string; stack?: boolean; children: React.ReactNode }) {
  const named = React.Children.map(children, (c) =>
    React.isValidElement<{ accessibilityLabel?: string; accessibilityHint?: string }>(c) && !c.props.accessibilityLabel ? React.cloneElement(c, { accessibilityLabel: label, accessibilityHint: hint }) : c,
  );
  return (
    <View style={[styles.row, stack && styles.rowStack]}>
      <View style={stack ? undefined : { flex: 1, paddingRight: spacing.md }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.optionLabel}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
      {named}
    </View>
  );
}

function Segmented({ value, options, onChange, accessibilityLabel, accessibilityHint }: { value: string; options: string[]; onChange: (v: string) => void; accessibilityLabel?: string; accessibilityHint?: string }) {
  return (
    <View style={[styles.seg, { flexWrap: 'wrap' }]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${o}` : o} style={[styles.segItem, on && styles.segItemOn]}>
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
  chev: { fontFamily: fonts.bodySemi, fontSize: 22, color: colors.lilacDeep, paddingLeft: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream, borderRadius: radius.md, padding: 14 },
  rowStack: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.sm },
  seg: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.pill, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.pill },
  segItemOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  segTextOn: { color: colors.cream },
  privacy: { fontFamily: fonts.body, color: colors.text, fontSize: 14, lineHeight: 21 },
  preview: { backgroundColor: colors.cream, borderRadius: radius.md, padding: 14, gap: 4 },
  previewLabel: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  previewText: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  sendNow: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center' },
  sendNowText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 14 },
  musicNote: { fontFamily: fonts.body, color: colors.lilacDeep, fontSize: 13, lineHeight: 19 },
  promise: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  turnOn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  turnOnText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 13 },
  previewHint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, textAlign: 'right' },
});
