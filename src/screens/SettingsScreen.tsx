import React, { useEffect, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { CommuteSettings } from '../components/CommuteSettings';
import { PresetSheet } from '../components/PresetSheet';
import { appByKey } from '../music';
import { notificationStatus, previewLine, sendLineNow, turnOnNotifications, type NotifyStatus } from '../notify';
import { presetInfo, PRESETS } from '../presets';
import { PODCAST_APPS } from '../shelfLogic';
import { onBatteryModeChanged } from '../tracking';
import { MoneyNote, UnlockSettingsRow } from '../components/UnlockRow';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, type } from '../theme';
import type { BatteryMode, CueMode, ListenDownload, NotifyPerWeek } from '../types';
import { live, ui } from '../i18n/ui';
import { LANGS, langFor, phoneLocale, SHIPPED, type Lang } from '../i18n/lang';

const BATTERY: Array<{ key: BatteryMode; label: string; hint: string }> = live(() => (['auto', 'best', 'saver'] as const).map((key) => ({ key, ...ui().settings.battery[key] })));

const HOW_OFTEN: Array<{ key: NotifyPerWeek; label: string; hint: string }> = live(() =>
  ([14, 7, 3, 0] as const).map((key) => ({ key, ...ui().settings.howOften[key] })),
);

const CUES: Array<{ key: CueMode; label: string; hint: string }> = live(() => (['silent', 'haptic', 'voice'] as const).map((key) => ({ key, ...ui().settings.cue[key] })));

export function SettingsScreen({ onOpenListen, onOpenEverything, onBack, runLive }: { onOpenListen: () => void; onOpenEverything: () => void; onBack?: () => void; runLive?: boolean }) {
  const { settings, update } = useSettings();
  const [presets, setPresets] = useState(false);
  const preset = settings.runPreset ? presetInfo(settings.runPreset) : null;
  const [preview, setPreview] = useState(previewLine(settings.fewerWords));

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
    const ok = await sendLineNow(settings.fewerWords);
    setStatus(await notificationStatus());
    if (ok) Alert.alert(ui().settings.onItsWay, ui().settings.lockYourPhoneOneArrives);
    else Alert.alert(ui().settings.notificationsAreOff, ui().settings.turnOnNotificationsForRuntrovert);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      {onBack ? <BackButton label={ui().settings.back} onPress={onBack} /> : null}
      <Text style={styles.h1} accessibilityRole="header">{ui().settings.settings}</Text>
      <UnlockSettingsRow />

      <Section title={ui().settings.todaySRun} bg={colors.lilac} fg={colors.lilacDeep}>
        <Pressable onPress={() => setPresets(true)} accessibilityRole="button" accessibilityHint={ui().settings.showsTheThreePresetsAnd} style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>{ui().settings.whatEachPresetShows}</Text>
            <Text style={styles.optionHint}>{preset ? ui().settings.pickedX(preset.name) : ''}{ui().settings.presetsHint(PRESETS.map((p) => p.name))}</Text>
          </View>
          <Text style={styles.chev} importantForAccessibility="no">›</Text>
        </Pressable>
      </Section>

      <Section title={ui().settings.cues} bg={colors.lilac} fg={colors.lilacDeep}>
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

      <Section title={ui().settings.running} bg={colors.mint} fg={colors.mintDeep}>
        <Row label={ui().settings.autoPause} hint={ui().settings.pauseWhenYouStopAt}>
          <Switch value={settings.autoPause} onValueChange={(v) => update({ autoPause: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Row label={ui().settings.countdown} hint={ui().settings.secondsBeforeTheRunStarts}>
          <Segmented
            value={String(settings.countdownS)}
            options={['0', '3', '5', '10']}
            onChange={(v) => update({ countdownS: Number(v) })}
          />
        </Row>
        <Row label={ui().settings.lockScreenAndWatch} hint={ui().settings.liveDistanceAndTimeOn}>
          <Switch value={settings.runNotes} onValueChange={(v) => update({ runNotes: v })} trackColor={{ true: colors.ink }} />
        </Row>
        {Platform.OS === 'android' && (
          <Row label={ui().settings.watchApp} hint={ui().settings.watchAppHint}>
            <Switch value={settings.watch} onValueChange={(v) => update({ watch: v })} trackColor={{ true: colors.ink }} />
          </Row>
        )}
        <Row label={ui().settings.units}>
          <Segmented value={settings.unitsKm ? 'km' : 'mi'} options={['km', 'mi']} onChange={(v) => update({ unitsKm: v === 'km' })} />
        </Row>
      </Section>

      <Section title={ui().settings.musicPodcasts} bg={colors.lilac} fg={colors.lilacDeep}>
        <Text style={styles.musicNote}>
          {ui().settings.musicNote(appByKey(settings.musicApp)?.name ?? ui().settings.phoneSDefault, PODCAST_APPS.find((a) => a.key === settings.podcastApp)?.label ?? ui().settings.askEachTime, settings.musicStrip)}
        </Text>
        <Pressable onPress={onOpenListen} accessibilityRole="button" style={[styles.option, styles.optionOn, { alignItems: 'center' }]}>
          <Text style={[styles.optionLabel, styles.optionLabelOn]}>{ui().settings.openListen}</Text>
        </Pressable>
      </Section>

      <Section title={ui().settings.batteryTitle} bg={colors.sky} fg={colors.skyDeep}>
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
        <Row label={ui().settings.keepScreenOn} hint={ui().settings.onlyDuringARunCosts}>
          <Switch value={settings.keepScreenOn} onValueChange={(v) => update({ keepScreenOn: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title={ui().settings.quietReminders} bg={colors.butter} fg={colors.butterDeep}>
        {status !== 'granted' ? (
          <Row label={ui().settings.notificationsAreOff} hint={ui().settings.soNoRemindersAndNo}>
            <Pressable
              onPress={async () => {
                await turnOnNotifications();
                setStatus(await notificationStatus());
              }}
              style={styles.turnOn}
              accessibilityRole="button"
              accessibilityLabel={ui().settings.turnOnNotifications}
            >
              <Text style={styles.turnOnText}>{ui().settings.turnOn}</Text>
            </Pressable>
          </Row>
        ) : null}
        <Text style={styles.promise}>{ui().settings.theDealNeverMoreThan}</Text>
        <Text style={styles.optionHint}>{ui().settings.shortDryNeverAStreak}</Text>
        {HOW_OFTEN.map((o) => {
          // 1 and 5 a week are from older builds: show them as the nearest option.
          const cur = settings.notifyPerWeek === 5 ? 3 : settings.notifyPerWeek === 1 ? 3 : settings.notifyPerWeek;
          const on = cur === o.key;
          return (
            <Pressable key={o.key} onPress={() => update({ notifyPerWeek: o.key })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.label}. ${o.hint}`} style={[styles.option, on && styles.optionOn]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{o.label}</Text>
                <Text style={[styles.optionHint, on && { color: colors.onInkMuted }]}>{o.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        <Row stack label={ui().settings.at} hint={settings.notifyAuto ? ui().settings.autoAbout45MinutesBefore : ui().settings.localTime}>
          <Segmented
            value={settings.notifyAuto ? 'Auto' : String(settings.notifyHour)}
            options={['Auto', '7', '8', '12', '17', '19']}
            labels={{ Auto: ui().settings.auto }}
            onChange={(v) => (v === 'Auto' ? update({ notifyAuto: true }) : update({ notifyAuto: false, notifyHour: Number(v), notifyMinute: 0 }))}
          />
        </Row>
        <Row label={ui().settings.afterARun} hint={ui().settings.oneQuietNoteFifteenMinutes}>
          <Switch value={settings.afterRunNote} onValueChange={(v) => update({ afterRunNote: v })} trackColor={{ true: colors.ink }} />
        </Row>
        <Row label={ui().settings.fewerWords} hint={ui().settings.fewerWordsHint}>
          <Switch
            value={settings.fewerWords}
            onValueChange={(v) => {
              update({ fewerWords: v });
              setPreview(previewLine(v));
            }}
            trackColor={{ true: colors.ink }}
          />
        </Row>
        <Pressable onPress={() => setPreview(previewLine(settings.fewerWords))} style={styles.preview} accessibilityRole="button" accessibilityLabel={ui().settings.soundsLikeX(preview)} accessibilityHint={ui().settings.showsAnotherExample}>
          <Text style={styles.previewLabel}>{ui().settings.soundsLike}</Text>
          <Text style={styles.previewText}>{preview}</Text>
          <Text style={styles.previewHint}>{ui().settings.tapForAnother}</Text>
        </Pressable>
        <Pressable onPress={onSendNow} style={styles.sendNow} accessibilityRole="button">
          <Text style={styles.sendNowText}>{ui().settings.sendMeOneNow}</Text>
        </Pressable>
      </Section>

      <Section title={ui().settings.map} bg={colors.mint} fg={colors.mintDeep}>
        <Row
          label={ui().settings.plainMap}
          hint={ui().settings.yourRouteTheLiveDot}
        >
          <Switch value={settings.plainMap} onValueChange={(v) => update({ plainMap: v, mapNoticeSeen: true })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title={ui().settings.motion} bg={colors.lilac} fg={colors.lilacDeep}>
        <Row label={ui().settings.stillBackgrounds} hint={ui().settings.stillBackgroundsHint}>
          <Switch value={settings.stillBackground} onValueChange={(v) => update({ stillBackground: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <CommuteSettings />

      <Section title={ui().stories.section} bg={colors.butter} fg={colors.butterDeep}>
        <Row label={ui().stories.thingsYouPassedSetting} hint={ui().stories.thingsYouPassedHint}>
          <Switch value={settings.stories} onValueChange={(v) => update({ stories: v, storiesOffered: true })} trackColor={{ true: colors.ink }} />
        </Row>
        {settings.stories && (
          <Row label={ui().stories.darkerHistory} hint={ui().stories.darkerHistoryHint}>
            <Switch value={settings.storiesDark} onValueChange={(v) => update({ storiesDark: v })} trackColor={{ true: colors.ink }} />
          </Row>
        )}
      </Section>

      <Section title={ui().settings.theSky} bg={colors.sky} fg={colors.skyDeep}>
        <Row label={ui().settings.localWeatherOnTheHome} hint={ui().settings.aLocationRoundedToAbout}>
          <Switch value={settings.weather} onValueChange={(v) => update({ weather: v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title={ui().settings.listen} bg={colors.butter} fg={colors.butterDeep}>
        <Row label={ui().settings.dailyList} hint={ui().settings.whenYouOpenListenDownload}>
          <Segmented
            value={settings.listenDownload}
            options={['ask', 'on', 'off']}
            labels={{ ask: ui().settings.ask, on: ui().settings.on, off: ui().settings.off }}
            onChange={(v) => update({ listenDownload: v as ListenDownload })}
          />
        </Row>
        <Row label={ui().settings.kitOffers} hint={ui().settings.aShelfOfRunningKit}>
          <Switch value={!settings.offersHidden} onValueChange={(v) => update({ offersHidden: !v })} trackColor={{ true: colors.ink }} />
        </Row>
      </Section>

      <Section title={ui().settings.yourData} bg={colors.peach} fg={colors.peachDeep}>
        <Pressable onPress={onOpenEverything} accessibilityRole="button" accessibilityHint={ui().settings.bringRunsInFromGpx} style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionLabel}>{ui().settings.everythingYouHave}</Text>
            <Text style={styles.optionHint}>{ui().settings.bringRunsInFromA}</Text>
          </View>
          <Text style={[styles.chev, { color: colors.peachDeep }]} importantForAccessibility="no">›</Text>
        </Pressable>
      </Section>

      <LanguageSection value={settings.language} locked={!!runLive} onPick={(language) => update({ language })} />

      <Section title={ui().settings.privacy} bg={colors.white} fg={colors.muted}>
        <Text style={styles.privacy}>{ui().settings.runtrovertHasNoServerYour}</Text>
        <Text style={styles.privacy}>{ui().stories.privacyLine}</Text>
        <MoneyNote />
      </Section>
      <PresetSheet open={presets} value={settings.runPreset ?? 'just'} onPick={(p) => update({ runPreset: p })} onClose={() => setPresets(false)} />
    </ScrollView>
  );
}

/** The phone's language by default; any language the whole app speaks can be picked instead. Names are in their own language. */
function LanguageSection({ value, locked, onPick }: { value: Lang | null; locked: boolean; onPick: (l: Lang | null) => void }) {
  const [open, setOpen] = useState(false);
  const phone = langFor(phoneLocale());
  const nameOf = (l: Lang) => LANGS.find((x) => x.code === l)?.name ?? l;
  const choices: Array<{ key: Lang | null; label: string }> = [{ key: null, label: ui().settings.phoneLanguage(nameOf(phone)) }, ...LANGS.filter((l) => SHIPPED.includes(l.code)).map((l) => ({ key: l.code, label: l.name }))];
  return (
    <Section title={ui().settings.language} bg={colors.sky} fg={colors.skyDeep}>
      <Pressable onPress={() => setOpen(!open)} disabled={locked} accessibilityRole="button" accessibilityState={{ expanded: open, disabled: locked }} style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionLabel}>{value ? nameOf(value) : ui().settings.phoneLanguage(nameOf(phone))}</Text>
          <Text style={styles.optionHint}>{locked ? ui().settings.languageAfterRun : ui().settings.languageHint}</Text>
        </View>
        <Text style={styles.chev} importantForAccessibility="no">{open ? '⌄' : '›'}</Text>
      </Pressable>
      {open && !locked
        ? choices.map((c) => {
            const on = c.key === value;
            return (
              <Pressable key={c.key ?? 'phone'} onPress={() => { setOpen(false); onPick(c.key); }} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.option, on && styles.optionOn]}>
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{c.label}</Text>
              </Pressable>
            );
          })
        : null}
    </Section>
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

// options are the stored values; labels, when given, are what the person reads.
function Segmented({ value, options, labels, onChange, accessibilityLabel, accessibilityHint }: { value: string; options: string[]; labels?: Record<string, string>; onChange: (v: string) => void; accessibilityLabel?: string; accessibilityHint?: string }) {
  return (
    <View style={[styles.seg, { flexWrap: 'wrap' }]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
      {options.map((o) => {
        const on = o === value;
        const label = labels?.[o] ?? o;
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={accessibilityLabel ? `${accessibilityLabel}: ${label}` : label} style={[styles.segItem, on && styles.segItemOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{label}</Text>
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
