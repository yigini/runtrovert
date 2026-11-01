import React, { useEffect, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { BackButton } from '../components/BackButton';
import { CommuteSettings } from '../components/CommuteSettings';
import { StrapSettings } from '../components/StrapSettings';
import { ShoesSettings } from '../components/ShoesSettings';
import { TellSomeoneSettings, WeekGoalSettings, WidgetNote } from '../components/AroundRunSettings';
import { listRuns } from '../db';
import { useShoes } from '../shoeStore';
import { totals } from '../shoes';
import { roughDistance } from '../weekGoal';
import { PresetSheet } from '../components/PresetSheet';
import { Group, kit, NavRow, Note, PlainRow, RadioList, Row, Segmented, Tag, WideButton } from '../components/SettingsKit';
import { useCommute } from '../commuteStore';
import { appByKey } from '../music';
import { notificationStatus, previewLine, sendLineNow, turnOnNotifications, type NotifyStatus } from '../notify';
import { presetInfo, PRESETS } from '../presets';
import { PODCAST_APPS } from '../shelfLogic';
import { strapSupported, useStrap } from '../strap';
import { onBatteryModeChanged } from '../tracking';
import { MoneyNote, UnlockSettingsRow } from '../components/UnlockRow';
import { useSettings } from '../settings';
import { colors, fonts, radius, spacing, themedStyles, scheme, switchColors } from '../theme';
import type { BatteryMode, CueMode, ListenDownload, NotifyPerWeek, Settings } from '../types';
import { live, ui } from '../i18n/ui';
import { LANGS, langFor, phoneLocale, SHIPPED, type Lang } from '../i18n/lang';

const BATTERY: Array<{ key: BatteryMode; label: string; hint: string }> = live(() => (['auto', 'best', 'saver'] as const).map((key) => ({ key, ...ui().settings.battery[key] })));

const HOW_OFTEN: Array<{ key: NotifyPerWeek; label: string; hint: string }> = live(() =>
  ([14, 7, 3, 0] as const).map((key) => ({ key, ...ui().settings.howOften[key] })),
);

const CUES: Array<{ key: CueMode; label: string; hint: string }> = live(() => (['silent', 'haptic', 'voice'] as const).map((key) => ({ key, ...ui().settings.cue[key] })));

/** The pages behind the main list. Import/export and credits are screens of their own (App.tsx). */
type Page = 'home' | 'run' | 'shoes' | 'gps' | 'map' | 'watch' | 'music' | 'reminders' | 'commute' | 'extras' | 'language' | 'appearance' | 'privacy';

/** A new palette redraws every screen, Settings included: come back to the page it was picked on. */
let reopen: Page | null = null;

const hasWatchPage = Platform.OS === 'android';

// 1 and 5 a week are from older builds: show them as the nearest option.
function howOftenNow(s: Settings): NotifyPerWeek {
  return s.notifyPerWeek === 5 || s.notifyPerWeek === 1 ? 3 : s.notifyPerWeek;
}

/** How many of the four optional fetches are switched on. The Listen list counts unless it is Off. */
export function fetchesOn(s: Pick<Settings, 'plainMap' | 'weather' | 'listenDownload' | 'stories'>): number {
  return [!s.plainMap, s.weather, s.listenDownload !== 'off', s.stories].filter(Boolean).length;
}

/**
 * Settings: one short list in groups, each row showing what it's set to now,
 * and a small page behind each row with only that topic. The phone's back
 * gesture returns to the list first, then leaves.
 */
export function SettingsScreen({ onOpenListen, onOpenEverything, onOpenCredits, onBack, runLive }: { onOpenListen: () => void; onOpenEverything: () => void; onOpenCredits: () => void; onBack?: () => void; runLive?: boolean }) {
  const [page, setPage] = useState<Page>(() => {
    const p = reopen ?? 'home';
    reopen = null;
    return p;
  });
  const home = () => setPage('home');

  useBatteryFollow();

  return (
    <ScrollView key={page} style={styles.screen} contentContainerStyle={styles.content}>
      {page === 'home' ? (
        <>
          {onBack ? <BackButton label={ui().settings.back} onPress={onBack} /> : null}
          <Text style={styles.h1} accessibilityRole="header">{ui().settings.settings}</Text>
          <Home open={setPage} onOpenEverything={onOpenEverything} onOpenCredits={onOpenCredits} />
        </>
      ) : (
        <>
          <BackButton label={ui().settings.settings} onPress={home} />
          <Text style={styles.h1} accessibilityRole="header">{titleOf(page)}</Text>
          {page === 'run' && <RunPage runLive={!!runLive} />}
          {page === 'shoes' && <ShoesSettings />}
          {page === 'gps' && <GpsPage />}
          {page === 'map' && <MapPage />}
          {page === 'watch' && <WatchPage />}
          {page === 'music' && <MusicPage onOpenListen={onOpenListen} />}
          {page === 'reminders' && <RemindersPage />}
          {page === 'commute' && <CommuteSettings />}
          {page === 'extras' && <ExtrasPage />}
          {page === 'language' && <LanguagePage locked={!!runLive} onDone={home} />}
          {page === 'appearance' && <AppearancePage runLive={!!runLive} />}
          {page === 'privacy' && <PrivacyPage />}
        </>
      )}
    </ScrollView>
  );
}

function titleOf(page: Page): string {
  const h = ui().settingsHub;
  switch (page) {
    case 'run':
      return h.duringARun;
    case 'shoes':
      return ui().shoes.title;
    case 'gps':
      return h.gpsBattery;
    case 'map':
      return ui().settings.map;
    case 'watch':
      return h.watchHeart;
    case 'music':
      return h.musicPodcasts;
    case 'reminders':
      return ui().settings.quietReminders;
    case 'commute':
      return ui().commute.section;
    case 'extras':
      return h.weatherExtras;
    case 'language':
      return ui().settings.language;
    case 'appearance':
      return ui().appearance.title;
    case 'privacy':
      return h.whatLeaves;
    default:
      return ui().settings.settings;
  }
}

/** Battery mode changes apply to a run in progress straight away. */
function useBatteryFollow() {
  const { settings } = useSettings();
  useEffect(() => {
    onBatteryModeChanged();
  }, [settings.batteryMode]);
}

function langName(l: Lang): string {
  return LANGS.find((x) => x.code === l)?.name ?? l;
}

function Home({ open, onOpenEverything, onOpenCredits }: { open: (p: Page) => void; onOpenEverything: () => void; onOpenCredits: () => void }) {
  const { settings: s } = useSettings();
  const commute = useCommute();
  const strap = useStrap();
  const h = ui().settingsHub;
  const cue = CUES.find((c) => c.key === s.cueMode)?.label ?? '';
  const battery = BATTERY.find((b) => b.key === s.batteryMode)?.label ?? '';
  const often = howOftenNow(s);
  const oftenLabel = HOW_OFTEN.find((o) => o.key === often)?.label ?? '';
  const reminders = often === 0 ? oftenLabel : h.remindersValue(oftenLabel, s.notifyAuto ? h.autoTime : `${s.notifyHour}:00`);
  const music = appByKey(s.musicApp)?.name ?? ui().settings.phoneSDefault;
  const podcasts = PODCAST_APPS.find((a) => a.key === s.podcastApp)?.label ?? ui().settings.askEachTime;
  const homeWork = !commute ? '' : commute.home && commute.work ? h.bothSet : commute.home ? h.homeSet : commute.work ? h.workSet : ui().commute.notSet;
  const language = s.language ? langName(s.language) : ui().settings.phoneLanguage(langName(langFor(phoneLocale())));
  const strapName = strapSupported() ? (strap.strap?.name ?? null) : null;
  const shoesValue = useShoesValue(s.unitsKm);
  const appearance = s.theme === 'system' ? ui().appearance.followsValue(scheme() === 'dark') : s.theme === 'dark' ? ui().appearance.dark : ui().appearance.light;

  return (
    <>
      <UnlockSettingsRow />
      <Group title={h.groupRunning}>
        <NavRow icon="run" label={h.duringARun} value={h.runValue(cue, s.autoPause, s.countdownS)} onPress={() => open('run')} />
        <NavRow icon="battery" label={h.gpsBattery} value={battery} onPress={() => open('gps')} />
        <NavRow icon="map" label={ui().settings.map} value={s.plainMap ? h.plain : h.streets} onPress={() => open('map')} />
        <NavRow icon="shoe" label={ui().shoes.title} value={shoesValue} onPress={() => open('shoes')} />
      </Group>
      <Group title={hasWatchPage ? h.groupWatchMusic : h.groupMusic}>
        {hasWatchPage ? <NavRow icon="heart" label={h.watchHeart} value={h.watchValue(s.watch, strapName)} onPress={() => open('watch')} /> : null}
        <NavRow icon="music" label={h.musicPodcasts} value={`${music} · ${podcasts}`} onPress={() => open('music')} />
      </Group>
      <Group title={h.groupDayToDay}>
        <NavRow icon="bell" label={ui().settings.quietReminders} value={reminders} onPress={() => open('reminders')} />
        <NavRow icon="home" label={ui().commute.section} value={homeWork} onPress={() => open('commute')} />
        <NavRow icon="sun" label={h.weatherExtras} value={h.extrasValue(s.weather, s.stories)} onPress={() => open('extras')} />
        <NavRow icon="globe" label={ui().settings.language} value={language} onPress={() => open('language')} />
        <NavRow icon="moon" label={ui().appearance.title} value={appearance} onPress={() => open('appearance')} />
      </Group>
      <Group title={h.groupPrivacy}>
        <NavRow icon="phone" label={h.whatLeaves} value={h.privacyValue(fetchesOn(s))} onPress={() => open('privacy')} />
        <NavRow icon="export" label={ui().settings.everythingYouHave} value={h.importValue} onPress={onOpenEverything} />
      </Group>
      <Group title={ui().credits.about}>
        <NavRow icon="info" label={ui().credits.title} onPress={onOpenCredits} />
      </Group>
      <Text style={styles.madeBy}>{ui().credits.madeBy}</Text>
    </>
  );
}

/** The pair new runs go to, and how far it has gone; or how to start. */
function useShoesValue(km: boolean): string {
  const book = useShoes();
  const [runs, setRuns] = useState<Array<{ id: number; distanceM: number }>>([]);
  const has = !!book?.shoes.length;
  useEffect(() => {
    if (has) listRuns().then(setRuns).catch(() => {});
  }, [has]);
  const shoe = book?.shoes.find((x) => x.id === book.defaultId) ?? null;
  if (!book || !shoe) return ui().shoes.rowNone;
  return ui().shoes.rowValue(shoe.name, roughDistance(totals(book, runs).get(shoe.id)?.distanceM ?? 0, km));
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} {...switchColors(value)} />;
}

function RunPage({ runLive }: { runLive: boolean }) {
  const { settings, update } = useSettings();
  const [presets, setPresets] = useState(false);
  const preset = settings.runPreset ? presetInfo(settings.runPreset) : null;
  const h = ui().settingsHub;
  return (
    <>
      <Group title={ui().settings.cues}>
        <RadioList options={CUES} value={settings.cueMode} onPick={(cueMode) => update({ cueMode })} />
      </Group>
      <Group title={h.startStop}>
        <Row label={ui().settings.countdown} hint={ui().settings.secondsBeforeTheRunStarts}>
          <Segmented value={String(settings.countdownS)} options={['0', '3', '5', '10']} onChange={(v) => update({ countdownS: Number(v) })} />
        </Row>
        <Row label={ui().settings.autoPause} hint={ui().settings.pauseWhenYouStopAt}>
          <Toggle value={settings.autoPause} onChange={(v) => update({ autoPause: v })} />
        </Row>
      </Group>
      <Group title={h.onScreen}>
        <Row label={ui().settings.lockScreenAndWatch} hint={ui().settings.liveDistanceAndTimeOn}>
          <Toggle value={settings.runNotes} onChange={(v) => update({ runNotes: v })} />
        </Row>
        <Row label={ui().settings.keepScreenOn} hint={ui().settings.onlyDuringARunCosts}>
          <Toggle value={settings.keepScreenOn} onChange={(v) => update({ keepScreenOn: v })} />
        </Row>
        {/* Switching mid-run would mix kilometre and mile splits in one run. */}
        <Row label={ui().settings.units} hint={runLive ? ui().settings.unitsAfterRun : undefined}>
          <Segmented value={settings.unitsKm ? 'km' : 'mi'} options={['km', 'mi']} disabled={runLive} onChange={(v) => update({ unitsKm: v === 'km' })} />
        </Row>
        <NavRow label={ui().settings.whatEachPresetShows} value={`${preset ? ui().settings.pickedX(preset.name) : ''}${ui().settings.presetsHint(PRESETS.map((p) => p.name))}`} onPress={() => setPresets(true)} />
      </Group>
      <TellSomeoneSettings />
      <PresetSheet open={presets} value={settings.runPreset ?? 'just'} onPick={(p) => update({ runPreset: p })} onClose={() => setPresets(false)} />
    </>
  );
}

function GpsPage() {
  const { settings, update } = useSettings();
  return (
    <>
      <Group>
        <RadioList options={BATTERY} value={settings.batteryMode} onPick={(batteryMode) => update({ batteryMode })} />
      </Group>
      <Note>{ui().settingsHub.gpsNote}</Note>
    </>
  );
}

function MapPage() {
  const { settings, update } = useSettings();
  return (
    <Group>
      <Row label={ui().settings.plainMap} hint={ui().settings.yourRouteTheLiveDot}>
        <Toggle value={settings.plainMap} onChange={(v) => update({ plainMap: v, mapNoticeSeen: true })} />
      </Row>
    </Group>
  );
}

function WatchPage() {
  const { settings, update } = useSettings();
  return (
    <>
      <Group title={ui().settingsHub.wearWatch}>
        <Row label={ui().settings.watchApp} hint={ui().settings.watchAppHint}>
          <Toggle value={settings.watch} onChange={(v) => update({ watch: v })} />
        </Row>
      </Group>
      <StrapSettings />
    </>
  );
}

function MusicPage({ onOpenListen }: { onOpenListen: () => void }) {
  const { settings, update } = useSettings();
  const h = ui().settingsHub;
  const music = appByKey(settings.musicApp)?.name ?? ui().settings.phoneSDefault;
  const podcasts = PODCAST_APPS.find((a) => a.key === settings.podcastApp)?.label ?? ui().settings.askEachTime;
  return (
    <>
      <Group title={h.yourApps}>
        <PlainRow>
          <View style={{ flex: 1 }} accessible>
            <Text style={kit.label}>{h.music}</Text>
            <Text style={kit.hint}>{h.musicValue(music, settings.musicStrip)}</Text>
          </View>
        </PlainRow>
        <PlainRow>
          <View style={{ flex: 1 }} accessible>
            <Text style={kit.label}>{h.podcasts}</Text>
            <Text style={kit.hint}>{podcasts}</Text>
          </View>
        </PlainRow>
      </Group>
      <WideButton quiet label={h.changeInListen} onPress={onOpenListen} />
      <Note>{h.listenNote}</Note>
      <Group title={ui().settings.listen}>
        <Row stack label={ui().settings.dailyList} hint={ui().settings.whenYouOpenListenDownload}>
          <Segmented
            value={settings.listenDownload}
            options={['ask', 'on', 'off']}
            labels={{ ask: ui().settings.ask, on: ui().settings.on, off: ui().settings.off }}
            onChange={(v) => update({ listenDownload: v as ListenDownload })}
          />
        </Row>
        <Row label={ui().settings.kitOffers} hint={ui().settings.aShelfOfRunningKit}>
          <Toggle value={!settings.offersHidden} onChange={(v) => update({ offersHidden: !v })} />
        </Row>
      </Group>
    </>
  );
}

function RemindersPage() {
  const { settings, update } = useSettings();
  const [preview, setPreview] = useState(previewLine(settings.fewerWords));
  const [status, setStatus] = useState<NotifyStatus>('granted');
  const h = ui().settingsHub;
  // App.tsx re-plans reminders when these settings change. Here we only keep the
  // permission line honest, including after a trip to the phone's settings.
  useEffect(() => {
    const check = () => notificationStatus().then(setStatus).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, []);

  async function onSendNow() {
    const ok = await sendLineNow(settings.fewerWords);
    setStatus(await notificationStatus());
    if (ok) Alert.alert(ui().settings.onItsWay, ui().settings.lockYourPhoneOneArrives);
    else Alert.alert(ui().settings.notificationsAreOff, ui().settings.turnOnNotificationsForRuntrovert);
  }

  return (
    <>
      {status !== 'granted' ? (
        <Group>
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
        </Group>
      ) : null}
      <Note strong>{ui().settings.theDealNeverMoreThan}</Note>
      <Group title={h.howOften}>
        <RadioList options={HOW_OFTEN} value={howOftenNow(settings)} onPick={(notifyPerWeek) => update({ notifyPerWeek })} />
      </Group>
      <Group title={h.whenAndHow}>
        <Row stack label={ui().settings.at} hint={settings.notifyAuto ? ui().settings.autoAbout45MinutesBefore : ui().settings.localTime}>
          <Segmented
            value={settings.notifyAuto ? 'Auto' : String(settings.notifyHour)}
            options={['Auto', '7', '8', '12', '17', '19']}
            labels={{ Auto: ui().settings.auto }}
            onChange={(v) => (v === 'Auto' ? update({ notifyAuto: true }) : update({ notifyAuto: false, notifyHour: Number(v), notifyMinute: 0 }))}
          />
        </Row>
        <Row label={ui().settings.afterARun} hint={ui().settings.oneQuietNoteFifteenMinutes}>
          <Toggle value={settings.afterRunNote} onChange={(v) => update({ afterRunNote: v })} />
        </Row>
        <Row label={ui().settings.fewerWords} hint={ui().settings.fewerWordsHint}>
          <Toggle
            value={settings.fewerWords}
            onChange={(v) => {
              update({ fewerWords: v });
              setPreview(previewLine(v));
            }}
          />
        </Row>
      </Group>
      <Pressable onPress={() => setPreview(previewLine(settings.fewerWords))} style={styles.preview} accessibilityRole="button" accessibilityLabel={ui().settings.soundsLikeX(preview)} accessibilityHint={ui().settings.showsAnotherExample}>
        <Text style={styles.previewLabel}>{ui().settings.soundsLike}</Text>
        <Text style={styles.previewText}>{preview}</Text>
        <Text style={styles.previewHint}>{ui().settings.tapForAnother}</Text>
      </Pressable>
      <WideButton label={ui().settings.sendMeOneNow} onPress={onSendNow} />
      <Note>{ui().settings.shortDryNeverAStreak}</Note>
    </>
  );
}

function ExtrasPage() {
  const { settings, update } = useSettings();
  return (
    <>
      <Group title={ui().settingsHub.runTab}>
        <Row label={ui().settings.localWeatherOnTheHome} hint={ui().settings.aLocationRoundedToAbout}>
          <Toggle value={settings.weather} onChange={(v) => update({ weather: v })} />
        </Row>
        <Row label={ui().settings.stillBackgrounds} hint={ui().settings.stillBackgroundsHint}>
          <Toggle value={settings.stillBackground} onChange={(v) => update({ stillBackground: v })} />
        </Row>
      </Group>
      <WeekGoalSettings />
      <Group title={ui().stories.section}>
        <Row label={ui().stories.thingsYouPassedSetting} hint={ui().stories.thingsYouPassedHint}>
          <Toggle value={settings.stories} onChange={(v) => update({ stories: v, storiesOffered: true })} />
        </Row>
        {settings.stories && (
          <Row label={ui().stories.darkerHistory} hint={ui().stories.darkerHistoryHint}>
            <Toggle value={settings.storiesDark} onChange={(v) => update({ storiesDark: v })} />
          </Row>
        )}
      </Group>
      {Platform.OS === 'android' ? <WidgetNote /> : null}
    </>
  );
}

/** Light, dark, or whatever the phone is set to (the default). The live run screen is dark in all three. */
function AppearancePage({ runLive }: { runLive: boolean }) {
  const { settings, update } = useSettings();
  const a = ui().appearance;
  const choices: Array<{ key: Settings['theme']; label: string; hint?: string }> = [
    { key: 'system', label: a.followPhone, hint: a.followPhoneHint },
    { key: 'light', label: a.light },
    { key: 'dark', label: a.dark },
  ];
  return (
    <>
      <Group>
        <RadioList
          options={choices}
          value={settings.theme}
          onPick={(theme) => {
            if (!runLive) reopen = 'appearance';
            update({ theme });
          }}
        />
      </Group>
      {runLive ? <Note strong>{a.afterRun}</Note> : null}
      <Note>{a.runStaysDark}</Note>
    </>
  );
}

/** The phone's language by default; any language the whole app speaks can be picked instead. Names are in their own language. */
function LanguagePage({ locked, onDone }: { locked: boolean; onDone: () => void }) {
  const { settings, update } = useSettings();
  const phone = langFor(phoneLocale());
  const choices: Array<{ key: Lang | 'phone'; label: string }> = [{ key: 'phone', label: ui().settings.phoneLanguage(langName(phone)) }, ...LANGS.filter((l) => SHIPPED.includes(l.code)).map((l) => ({ key: l.code, label: l.name }))];
  if (locked) return <Note strong>{ui().settings.languageAfterRun}</Note>;
  return (
    <>
      <Group>
        <RadioList
          options={choices}
          value={settings.language ?? 'phone'}
          onPick={(k) => {
            update({ language: k === 'phone' ? null : k });
            onDone();
          }}
        />
      </Group>
      <Note>{ui().settings.languageHint}</Note>
    </>
  );
}

/**
 * What leaves this phone: the privacy text as a list. What never leaves, then
 * the four things the app can fetch, each with its switch right there. The
 * switches are the same settings as on their own pages.
 */
function PrivacyPage() {
  const { settings, update } = useSettings();
  const h = ui().settingsHub;
  return (
    <>
      <Group title={h.staysHere}>
        <Row label={h.yourRuns} hint={h.yourRunsHint}>
          <Tag label={h.neverSent} />
        </Row>
        <Row label={ui().commute.section} hint={h.homeWorkHint}>
          <Tag label={h.neverSent} />
        </Row>
        <Row label={ui().settings.quietReminders} hint={h.remindersHint}>
          <Tag label={h.neverSent} />
        </Row>
      </Group>
      <Group title={h.fetched}>
        <Row label={h.mapStreets} hint={h.mapStreetsHint}>
          <Toggle value={!settings.plainMap} onChange={(v) => update({ plainMap: !v, mapNoticeSeen: true })} />
        </Row>
        <Row label={h.weather} hint={h.weatherHint}>
          <Toggle value={settings.weather} onChange={(v) => update({ weather: v })} />
        </Row>
        <Row stack label={h.listenList} hint={h.listenListHint}>
          <Segmented
            value={settings.listenDownload}
            options={['ask', 'on', 'off']}
            labels={{ ask: ui().settings.ask, on: ui().settings.on, off: ui().settings.off }}
            onChange={(v) => update({ listenDownload: v as ListenDownload })}
          />
        </Row>
        <Row label={ui().stories.thingsYouPassedSetting} hint={h.storiesHint}>
          <Toggle value={settings.stories} onChange={(v) => update({ stories: v, storiesOffered: true })} />
        </Row>
      </Group>
      <Note>{h.alsoTrue}</Note>
      <MoneyNote />
    </>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg - 4 },
  h1: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: colors.text },
  madeBy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.md },
  preview: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 4 },
  previewLabel: { fontFamily: fonts.bodySemi, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  previewText: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  previewHint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, textAlign: 'right' },
  turnOn: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  turnOnText: { fontFamily: fonts.bodySemi, color: colors.cream, fontSize: 13 },
}));
