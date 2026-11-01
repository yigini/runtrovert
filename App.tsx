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
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, ToastAndroid, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { handleBack, ScreenActive } from './src/back';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OpenSettings } from './src/components/SettingsGear';
import { closeUnfinishedRuns, getRun, touchRuns } from './src/db';
import { HistoryScreen, type RunsSection } from './src/screens/HistoryScreen';
import { MeScreen } from './src/screens/MeScreen';
import { ListenScreen } from './src/screens/ListenScreen';
import { RunDetailScreen } from './src/screens/RunDetailScreen';
import { PlaceScreen } from './src/screens/PlaceScreen';
import { RunScreen, type Ghost, type RunExtra } from './src/screens/RunScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrainScreen } from './src/screens/TrainScreen';
import { UnlockHost } from './src/screens/UnlockScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { EverythingScreen } from './src/screens/EverythingScreen';
import { CreditsScreen } from './src/screens/CreditsScreen';
import { FEWER_ACTION, fewer, fewerMessage, notificationStatus, notifyAfterRun, requestNotificationPermission, rescheduleReminders } from './src/notify';
import { SettingsProvider, useSettings } from './src/settings';
import { onRestart } from './src/restart';
import { startBilling } from './src/billing';
import { recoverRun, subscribe } from './src/tracking';
import { colors, fonts, night, onScheme, radius, scheme, setScheme, spacing, themedStyles } from './src/theme';
import { dayName } from './src/training/adapt';
import type { Place } from './src/placeStore';
import { onRunSaved } from './src/training/store';
import { onWatchRuns } from './src/wear';
import { syncRunToHealth } from './src/health';
import type { Session } from './src/training/types';
import { loadUnlock } from './src/unlockState';
import { NEWS } from './src/whatsNew';
import { ui } from './src/i18n/ui';
import { refreshWidgets } from './src/widget';
import { goalStore } from './src/extraStores';
import { lang } from './src/i18n/lang';
import { warmSigs } from './src/placeStore';
import { loadYou } from './src/you';
import { onRunsImported } from './src/io/importJob';
import { okToFollow } from './src/followCheck';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Work that can wait until the first screen is drawn and settled: the widgets,
 * re-planning reminders, and working out bests and loops for runs that have
 * none yet. Doing it all at launch made opening the app feel slow.
 */
function later(ms: number, work: () => void): () => void {
  let idle: number | null = null;
  const t = setTimeout(() => {
    // When the JS thread next has nothing to draw, if the phone can tell us; otherwise now.
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(() => work(), { timeout: 3000 });
    else work();
  }, ms);
  return () => {
    clearTimeout(t);
    if (idle != null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
  };
}

/** The day, so a tab kept open since yesterday is drawn again (today's session, this week). */
const dayOf = (t = Date.now()) => new Date(t).toDateString();

type Tab = 'run' | 'runs' | 'train' | 'me';
/** Opened over any tab: Settings from the gear, every Listen shelf from the sheet beside Start. */
type Sub = 'settings' | 'listen' | 'everything' | 'credits' | null;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Fraunces_300Light, Fraunces_400Regular_Italic, Fraunces_600SemiBold });
  const ready = fontsLoaded || !!fontError; // if fonts fail, carry on with system fonts rather than hang on the splash
  // A restored backup starts every screen again from the database.
  const [generation, setGeneration] = useState(0);
  useEffect(() => onRestart(() => setGeneration((g) => g + 1)), []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SettingsProvider key={generation}>
          <Shell />
        </SettingsProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { settings, ready, update } = useSettings();
  const phoneScheme = useColorScheme();
  // The window behind the app (seen while the keyboard opens) takes the ground colour.
  useEffect(() => {
    const paint = () => void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
    paint();
    return onScheme(paint);
  }, []);
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
  // Runs brought in reach every list once, when the import ends, wherever the runner is by then.
  useEffect(
    () =>
      onRunsImported(() => {
        // Runs brought in or restored: every kept list and answer is read again.
        touchRuns();
        setRefreshKey((k) => k + 1);
      }),
    [],
  );
  const [liveRun, setLiveRun] = useState(false);
  const [countingDown, setCountingDown] = useState(false);
  const wasLive = useRef(false);
  const [finishing, setFinishing] = useState(false);
  // A session opened from the Train tab, waiting on the Run tab's start button.
  const [sessionRequest, setSessionRequest] = useState<Session | null>(null);
  const [planKey, setPlanKey] = useState(0);
  // Tabs opened at least once stay mounted; the day they were drawn on.
  const [visited, setVisited] = useState<{ runs: boolean; train: boolean; me: boolean }>({ runs: false, train: false, me: false });
  const [day, setDay] = useState(dayOf);
  useEffect(() => {
    if (tab === 'run') return;
    setVisited((v) => (v[tab] ? v : { ...v, [tab]: true }));
    setDay((d) => (d === dayOf() ? d : dayOf()));
  }, [tab]);
  useEffect(
    () =>
      subscribe((t) => {
        const live = t.status !== 'idle';
        // A run that starts (or comes back after the app was closed) is always shown:
        // the tab bar is gone during a run, so another tab would be a dead end.
        if (live && !wasLive.current) {
          setSub((s) => (s === 'listen' ? s : null));
          setTab('run');
        }
        wasLive.current = live;
        setLiveRun(live);
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

  // The home-screen widgets get fresh words on open, after any change to the runs, and with the units, language or weekly goal.
  const goal = goalStore.use();
  useEffect(() => {
    if (ready && settings.onboarded) return later(1200, () => void refreshWidgets().catch(() => {}));
  }, [ready, settings.onboarded, refreshKey, settings.unitsKm, settings.language, goal]);
  // Bests and loops for runs that don't have them yet (runs brought in from files), a few at a time,
  // so the first finish screen or Your runs after an import doesn't do it all at once.
  useEffect(() => {
    if (!ready || !settings.onboarded) return;
    return later(4000, () => {
      warmSigs()
        .then(() => loadYou())
        .catch(() => {});
    });
  }, [ready, settings.onboarded, refreshKey]);
  // Runs recorded on the watch alone arrive when phone and watch meet again: tick the plan, refresh the lists.
  useEffect(() => {
    onWatchRuns(async (ids) => {
      for (const id of ids) {
        const run = await getRun(id).catch(() => null);
        if (run) await onRunSaved(run, null).catch(() => {});
      }
      touchRuns();
      setRefreshKey((k) => k + 1);
      setPlanKey((k) => k + 1);
    });
    return () => onWatchRuns(null);
  }, []);

  // Re-plan the next two weeks of reminders on open and whenever their settings change.
  useEffect(() => {
    if (ready && settings.onboarded) {
      return later(1500, () => void rescheduleReminders(settings).catch(() => {}));
    }
  }, [ready, settings.onboarded, settings.notifyPerWeek, settings.notifyHour, settings.notifyMinute, settings.notifyAuto, settings.weather, settings.language, settings.fewerWords, planKey]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /**
   * The one later ask, for phones that never said yes: on open for people set
   * up before the welcome asked (nothing would ever arrive otherwise), after a
   * saved run for people who said "Not now". Never twice, never once blocked.
   */
  const askAgain = useCallback(async () => {
    const s = settingsRef.current;
    if (s.notifyAskedAgain || s.notifyPerWeek === 0) return;
    if ((await notificationStatus().catch(() => 'blocked')) !== 'ask') return;
    update({ notifyAskedAgain: true });
    Alert.alert(ui().notify.askAgainTitle, ui().notify.askAgainText, [
      { text: ui().welcome.notNow, style: 'cancel' },
      {
        text: ui().welcome.yesQuietly,
        onPress: async () => {
          if (await requestNotificationPermission().catch(() => false)) {
            update({ notifyAsk: 'yes' });
            rescheduleReminders(settingsRef.current).catch(() => {});
          }
        },
      },
    ]);
  }, [update]);
  useEffect(() => {
    if (ready && settings.onboarded && settings.notifyAsk === 'unasked') askAgain();
  }, [ready, settings.onboarded]);

  // Taps on notifications, including the one that launched the app.
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
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

  // Light or dark: the phone's choice unless Settings > Appearance says otherwise.
  // A live run (and its countdown and finish) keeps the palette it started with;
  // the new one arrives when it ends, the same way a new language does.
  const wanted = settings.theme === 'system' ? (phoneScheme === 'dark' ? 'dark' : 'light') : settings.theme;
  if (ready && !liveRun && !countingDown) setScheme(wanted);
  const dark = scheme() === 'dark';

  if (!ready) return <SafeAreaView style={styles.root} />;
  if (!settings.onboarded) {
    return (
      <SafeAreaView style={styles.root} key={scheme()}>
        <StatusBar style={dark ? 'light' : 'dark'} />
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

  async function onSaved(runId: number, share = false, extra?: RunExtra) {
    setShareOpen(share);
    getRun(runId)
      .then((run) => notifyAfterRun(settings, runId, run?.moodAfter != null))
      .catch(() => {});
    syncRunToHealth(runId).catch(() => {});
    setRefreshKey((k) => k + 1);
    setOpenRun(runId);
    setTab('runs');
    setSessionRequest(null);
    // Tick the day's session off the plan, and let pain ease the days ahead.
    try {
      const run = await getRun(runId);
      if (run) {
        const r = await onRunSaved(run, extra?.pain ?? null, extra?.sessionId ?? null, { steps: extra?.steps ?? null, feel: extra?.feel ?? null });
        // One note at most: pain advice says more than an eased day does.
        const eased = r.eased ? ui().review.easedX(r.eased.title, dayName(r.eased.date)) : null;
        const said = r.advice ?? [eased, r.lighter ? ui().review.nextWeekLighter : null].filter(Boolean).join(' ');
        if (said) Alert.alert(ui().app.noted, said);
      }
    } catch {
      // no plan, or nothing to change
    }
    setPlanKey((k) => k + 1);
    rescheduleReminders({ ...settings }).catch(() => {});
    // Said "Not now" at the welcome: one more ask, now there's a run behind it.
    setTimeout(() => askAgain(), 2500);
  }

  async function runAgain(p: Place) {
    // Only straight to the Run tab when you're near the place's route; far away, it asks first.
    if (!(await okToFollow(p.sig.pts.map(([lat, lon]) => ({ lat, lon })), p.name, settings.unitsKm))) return;
    setOpenPlace(null);
    setPlaceFrom(null);
    setGhost({ placeId: p.id, name: p.name, path: p.sig.pts.map(([latitude, longitude]) => ({ latitude, longitude })), follow: true });
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
        <StatusBar style={inkMode || dark ? 'light' : 'dark'} />
        {/* A new language or palette redraws every screen; neither changes during a live run. */}
        <View style={{ flex: 1 }} key={`${lang()}-${scheme()}`}>
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
              onCountdown={setCountingDown}
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
              onOpenCredits={() => setSub('credits')}
              onOpenEverything={() => {
                setEverythingFrom('settings');
                setSub('everything');
              }}
              onFollow={(r) => {
                setGhost({ name: r.name, path: r.path.map((p) => ({ latitude: p.lat, longitude: p.lon })), follow: true });
                go('run');
              }}
            />
          )}
          {sub === 'everything' && <EverythingScreen onBack={() => setSub(everythingFrom)} />}
          {sub === 'credits' && <CreditsScreen onBack={() => setSub('settings')} />}
          {sub === 'listen' && <ListenScreen runLive={liveRun} onBack={() => setSub(null)} />}
          {/* Your runs and Train stay mounted once visited (hidden like the Run tab), so coming back is
              instant and keeps its scroll. A new day draws them again. */}
          {(visited.train || tab === 'train') && (
            <View style={[{ flex: 1 }, (sub != null || tab !== 'train') && styles.hidden]}>
              <ScreenActive.Provider value={sub == null && tab === 'train'}>
                <TrainScreen
                  key={day}
                  refreshKey={planKey + refreshKey}
                  onChanged={() => setPlanKey((k) => k + 1)}
                  onStartSession={(s) => {
                    setSessionRequest(s);
                    setTab('run');
                  }}
                />
              </ScreenActive.Provider>
            </View>
          )}
          {(visited.me || tab === 'me') && (
            <View style={[{ flex: 1 }, (sub != null || tab !== 'me') && styles.hidden]}>
              <ScreenActive.Provider value={sub == null && tab === 'me'}>
                <MeScreen
                  key={day}
                  active={sub == null && tab === 'me'}
                  refreshKey={refreshKey + planKey}
                  onOpenPlace={(id) => {
                    setRunsSection('places');
                    setOpenRun(null);
                    setPlaceFrom(null);
                    setOpenPlace(id);
                    go('runs');
                  }}
                  onAllPlaces={() => {
                    setRunsSection('places');
                    setOpenRun(null);
                    setOpenPlace(null);
                    go('runs');
                  }}
                  onOpenTrain={() => go('train')}
                  onBringIn={() => {
                    setEverythingFrom(null);
                    setSub('everything');
                  }}
                  onWhatsHere={() => {
                    setEverythingFrom(null);
                    setSub('everything');
                  }}
                />
              </ScreenActive.Provider>
            </View>
          )}
          {(visited.runs || tab === 'runs') && (
            <View style={[{ flex: 1 }, (sub != null || tab !== 'runs' || openRun != null || openPlace != null) && styles.hidden]}>
              <ScreenActive.Provider value={sub == null && tab === 'runs' && openRun == null && openPlace == null}>
                <HistoryScreen
                  key={day}
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
                  onChanged={() => setRefreshKey((k) => k + 1)}
                />
              </ScreenActive.Provider>
            </View>
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
              onFollow={(name, path) => {
                setShareOpen(false);
                setOpenRun(null);
                setGhost({ name, path, follow: true });
                go('run');
              }}
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
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </View>
        {!liveRun && !countingDown && sub == null && (
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
            <TabButton label={ui().app.me} active={tab === 'me'} onPress={() => go('me')} />
          </View>
        )}
        <UnlockHost key={scheme()} />
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

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: colors.cream },
  rootInk: { backgroundColor: night.ink },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.cream, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: spacing.sm + 2 },
  // Four tabs share the width evenly, so a narrow phone or a big font never pushes one off the edge.
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.muted },
  tabTextActive: { color: colors.cream },
}));
