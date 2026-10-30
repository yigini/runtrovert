// One import per weight: the package root requires all 18 weights of each family, and
// Metro bundles every one of them (about 2 MB of fonts we never use).
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_300Light } from '@expo-google-fonts/fraunces/300Light';
import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { handleBack } from './src/back';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OpenSettings } from './src/components/SettingsGear';
import { scheduleCommuteNote } from './src/commuteStore';
import { closeUnfinishedRuns, getRun } from './src/db';
import { HistoryScreen, type RunsSection } from './src/screens/HistoryScreen';
import { ListenScreen } from './src/screens/ListenScreen';
import { RunDetailScreen } from './src/screens/RunDetailScreen';
import { PlaceScreen } from './src/screens/PlaceScreen';
import { RunScreen, type Ghost } from './src/screens/RunScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrainScreen } from './src/screens/TrainScreen';
import { UnlockHost } from './src/screens/UnlockScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { EverythingScreen } from './src/screens/EverythingScreen';
import { FEWER_ACTION, fewer, fewerMessage, notifyAfterRun, requestNotificationPermission, rescheduleReminders } from './src/notify';
import { SettingsProvider, useSettings } from './src/settings';
import { startBilling } from './src/billing';
import { recoverRun, subscribe } from './src/tracking';
import { colors, fonts, radius, spacing } from './src/theme';
import type { PainLevel } from './src/training/adapt';
import type { Place } from './src/placeStore';
import { schedulePlanReminders } from './src/training/remind';
import { onRunSaved } from './src/training/store';
import type { Session } from './src/training/types';
import { loadUnlock } from './src/unlockState';
import { NEWS } from './src/whatsNew';
import { ui } from './src/i18n/ui';
import { lang } from './src/i18n/lang';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Tab = 'run' | 'runs' | 'train';
/** Opened over any tab: Settings from the gear, every Listen shelf from the sheet beside Start. */
type Sub = 'settings' | 'listen' | 'everything' | null;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Fraunces_300Light, Fraunces_400Regular_Italic, Fraunces_600SemiBold });
  const ready = fontsLoaded || !!fontError; // if fonts fail, carry on with system fonts rather than hang on the splash
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SettingsProvider>
          <Shell />
        </SettingsProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { settings, ready, update } = useSettings();
  const [tab, setTab] = useState<Tab>('run');
  const [sub, setSub] = useState<Sub>(null);
  const [everythingFrom, setEverythingFrom] = useState<Sub>(null);
  // Just run keeps the dusk map screen; the other two running layouts are on cream.
  const [runInk, setRunInk] = useState(true);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [runsSection, setRunsSection] = useState<RunsSection>('runs');
  const [openPlace, setOpenPlace] = useState<number | null>(null);
  // A place opened from a run's page: back goes to that run again.
  const [placeFrom, setPlaceFrom] = useState<number | null>(null);
  // "Run this again" from a place, waiting on the Run tab to start.
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [shareOpen, setShareOpen] = useState(false); // open the share card on arrival ("Keep it and share")
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveRun, setLiveRun] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // A session opened from the Train tab, waiting on the Run tab's start button.
  const [sessionRequest, setSessionRequest] = useState<Session | null>(null);
  const [planKey, setPlanKey] = useState(0);
  useEffect(
    () =>
      subscribe((t) => {
        setLiveRun(t.status !== 'idle');
        setFinishing(t.halted);
      }),
    [],
  );

  // The phone's back gesture: whatever is open on screen first (src/back.ts,
  // Settings and the Listen shelves included), then back to the Run tab, and
  // only then out of the app, on a second press.
  const nav = useRef({ tab });
  nav.current = { tab };
  const openSettings = useCallback(() => setSub('settings'), []);
  const lastBack = useRef(0);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (handleBack()) return true;
      if (nav.current.tab !== 'run') {
        setTab('run');
        return true;
      }
      const now = Date.now();
      if (now - lastBack.current < 2000) return false;
      lastBack.current = now;
      ToastAndroid.show(ui().app.backAgainToLeave, ToastAndroid.SHORT);
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // What this phone has unlocked, then (once billing is on) what the store says.
    loadUnlock()
      .then(startBilling)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // If the app was killed mid-run, pick the run back up; otherwise close
    // strays where they stopped (an empty one is removed, a recorded one kept).
    recoverRun()
      .then((restored) => {
        if (!restored) return closeUnfinishedRuns();
      })
      .catch(() => {});
  }, []);

  // Re-plan the next two weeks of reminders on open and whenever their settings change.
  useEffect(() => {
    if (ready && settings.onboarded) {
      rescheduleReminders(settings)
        .then(() => schedulePlanReminders(settings))
        .then(() => scheduleCommuteNote(settings))
        .catch(() => {});
    }
  }, [ready, settings.onboarded, settings.notifyPerWeek, settings.notifyHour, settings.notifyMinute, settings.notifyAuto, settings.weather, settings.language, planKey]);

  // Taps on notifications, including the one that launched the app.
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!ready || !response) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = response.notification.request.content.data ?? {};
    if (response.actionIdentifier === FEWER_ACTION) {
      const next = fewer(settingsRef.current.notifyPerWeek);
      update({ notifyPerWeek: next });
      Alert.alert(ui().app.reminders, fewerMessage(next));
    } else if (data.kind === 'commute') {
      setSub(null);
      setTab('run');
    } else if (data.kind === 'plan') {
      setSub(null);
      setTab('train');
    } else if (data.kind === 'after-run' && typeof data.runId === 'number') {
      setSub(null);
      setOpenRun(data.runId);
      setTab('runs');
    }
  }, [ready, response]);

  if (!ready) return <SafeAreaView style={styles.root} />;
  if (!settings.onboarded) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <WelcomeScreen
          onDone={async (yes) => {
            if (yes) await requestNotificationPermission().catch(() => false);
            // The welcome told them what the map service sees, so tiles may load.
            update({ onboarded: true, notifyAsk: yes ? 'yes' : 'no', seenNews: NEWS.id, mapNoticeSeen: true });
          }}
        />
      </SafeAreaView>
    );
  }

  async function onSaved(runId: number, share = false, extra?: { pain: PainLevel | null; sessionId: string | null }) {
    setShareOpen(share);
    getRun(runId)
      .then((run) => notifyAfterRun(settings, runId, run?.moodAfter != null))
      .catch(() => {});
    setRefreshKey((k) => k + 1);
    setOpenRun(runId);
    setTab('runs');
    setSessionRequest(null);
    // Tick the day's session off the plan, and let pain ease the days ahead.
    try {
      const run = await getRun(runId);
      if (run) {
        const r = await onRunSaved(run, extra?.pain ?? null, extra?.sessionId ?? null);
        if (r.advice) Alert.alert(ui().app.noted, r.advice);
      }
    } catch {
      // no plan, or nothing to change
    }
    setPlanKey((k) => k + 1);
    rescheduleReminders({ ...settings })
      .then(() => schedulePlanReminders(settings))
      .then(() => scheduleCommuteNote(settings))
      .catch(() => {});
  }

  function runAgain(p: Place) {
    setOpenPlace(null);
    setPlaceFrom(null);
    setGhost({ placeId: p.id, name: p.name, path: p.sig.pts.map(([latitude, longitude]) => ({ latitude, longitude })) });
    go('run');
  }

  const inkMode = liveRun && !finishing && tab === 'run' && sub == null && runInk;
  const go = (t: Tab) => {
    setSub(null);
    setTab(t);
  };
  return (
    <OpenSettings.Provider value={openSettings}>
      <SafeAreaView style={[styles.root, inkMode && styles.rootInk]}>
        <StatusBar style={inkMode ? 'light' : 'dark'} />
        {/* A new language redraws every screen; Settings can't change it during a live run. */}
        <View style={{ flex: 1 }} key={lang()}>
          {/* RunScreen stays mounted so a live run survives tab switches. */}
          <View style={[{ flex: 1 }, (tab !== 'run' || sub != null) && styles.hidden]}>
            <RunScreen
              onSaved={onSaved}
              requested={sessionRequest}
              onRequestTaken={() => setSessionRequest(null)}
              planKey={planKey}
              focused={tab === 'run' && sub == null}
              onOpenPlan={() => setTab('train')}
              onPlanChanged={() => setPlanKey((k) => k + 1)}
              onBrowseListen={() => setSub('listen')}
              onInk={setRunInk}
              ghost={ghost}
              onGhostTaken={() => setGhost(null)}
              onWatchStart={() => {
                setSub(null);
                setTab('run');
              }}
            />
          </View>
          {sub === 'settings' && (
            <SettingsScreen
              runLive={liveRun}
              onBack={() => setSub(null)}
              onOpenListen={() => setSub('listen')}
              onOpenEverything={() => {
                setEverythingFrom('settings');
                setSub('everything');
              }}
            />
          )}
          {sub === 'everything' && <EverythingScreen onBack={() => setSub(everythingFrom)} onChanged={() => setRefreshKey((k) => k + 1)} />}
          {sub === 'listen' && <ListenScreen runLive={liveRun} onBack={() => setSub(null)} />}
          {sub == null && tab === 'train' && (
            <TrainScreen
              refreshKey={planKey + refreshKey}
              onChanged={() => setPlanKey((k) => k + 1)}
              onStartSession={(s) => {
                setSessionRequest(s);
                setTab('run');
              }}
            />
          )}
          {sub == null && tab === 'runs' && openRun == null && openPlace == null && (
            <HistoryScreen
              onOpen={(id) => {
                setShareOpen(false);
                setOpenRun(id);
              }}
              refreshKey={refreshKey}
              onBringIn={() => {
                setEverythingFrom(null);
                setSub('everything');
              }}
              section={runsSection}
              onSection={setRunsSection}
              onOpenPlace={setOpenPlace}
              onRunAgain={runAgain}
            />
          )}
          {sub == null && tab === 'runs' && openRun == null && openPlace != null && (
            <PlaceScreen
              key={openPlace}
              placeId={openPlace}
              onBack={() => {
                setOpenPlace(null);
                if (placeFrom != null) setOpenRun(placeFrom);
                setPlaceFrom(null);
              }}
              onChanged={() => setRefreshKey((k) => k + 1)} onRunAgain={runAgain} />
          )}
          {sub == null && tab === 'runs' && openRun != null && (
            <RunDetailScreen
              key={openRun}
              runId={openRun}
              shareOnOpen={shareOpen}
              onBack={() => {
                setShareOpen(false);
                setOpenRun(null);
              }}
              onDeleted={() => {
                setOpenRun(null);
                setRefreshKey((k) => k + 1);
              }}
              onOpenPlace={(id) => {
                setPlaceFrom(openRun);
                setShareOpen(false);
                setOpenRun(null);
                setOpenPlace(id);
              }}
            />
          )}
        </View>
        {!liveRun && sub == null && (
          <View style={styles.tabs} accessibilityRole="tablist">
            <TabButton label={ui().app.run} active={tab === 'run'} onPress={() => go('run')} />
            <TabButton
              label={ui().app.yourRuns}
              active={tab === 'runs'}
              onPress={() => {
                setOpenRun(null);
                setOpenPlace(null);
                setPlaceFrom(null);
                go('runs');
              }}
            />
            <TabButton label={ui().app.train} active={tab === 'train'} onPress={() => go('train')} />
          </View>
        )}
        <UnlockHost />
      </SafeAreaView>
    </OpenSettings.Provider>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && !active && { opacity: 0.7 }]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  rootInk: { backgroundColor: colors.ink },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.cream, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.sm + 2 },
  // Three tabs share the width evenly, so a narrow phone or a big font never pushes one off the edge.
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.muted },
  tabTextActive: { color: colors.cream },
});
