import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Fraunces_300Light, Fraunces_400Regular_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { discardUnfinishedRuns, getRun } from './src/db';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ListenScreen } from './src/screens/ListenScreen';
import { RunDetailScreen } from './src/screens/RunDetailScreen';
import { RunScreen } from './src/screens/RunScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrainScreen } from './src/screens/TrainScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { FEWER_ACTION, fewer, fewerMessage, notifyAfterRun, requestNotificationPermission, rescheduleReminders } from './src/notify';
import { SettingsProvider, useSettings } from './src/settings';
import { recoverRun, subscribe } from './src/tracking';
import { colors, fonts, spacing } from './src/theme';
import type { PainLevel } from './src/training/adapt';
import { schedulePlanReminders } from './src/training/remind';
import { onRunSaved } from './src/training/store';
import type { Session } from './src/training/types';
import { NEWS } from './src/whatsNew';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Tab = 'run' | 'train' | 'history' | 'listen' | 'settings';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, Fraunces_300Light, Fraunces_400Regular_Italic, Fraunces_600SemiBold });
  const ready = fontsLoaded || !!fontError; // if fonts fail, carry on with system fonts rather than hang on the splash
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const { settings, ready, update } = useSettings();
  const [tab, setTab] = useState<Tab>('run');
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false); // open the share card on arrival ("Keep it and share")
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveRun, setLiveRun] = useState(false);
  // A session opened from the Train tab, waiting on the Run tab's start button.
  const [sessionRequest, setSessionRequest] = useState<Session | null>(null);
  const [planKey, setPlanKey] = useState(0);
  useEffect(() => subscribe((t) => setLiveRun(t.status !== 'idle')), []);

  useEffect(() => {
    // If the app was killed mid-run, pick the run back up; otherwise tidy strays.
    recoverRun()
      .then((restored) => {
        if (!restored) return discardUnfinishedRuns();
      })
      .catch(() => {});
  }, []);

  // Re-plan the next two weeks of reminders on open and whenever their settings change.
  useEffect(() => {
    if (ready && settings.onboarded) {
      rescheduleReminders(settings)
        .then(() => schedulePlanReminders(settings))
        .catch(() => {});
    }
  }, [ready, settings.onboarded, settings.notifyPerWeek, settings.notifyHour, settings.notifyMinute, settings.notifyAuto, settings.weather, planKey]);

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
      Alert.alert('Reminders', fewerMessage(next));
    } else if (data.kind === 'after-run' && typeof data.runId === 'number') {
      setOpenRun(data.runId);
      setTab('history');
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
            update({ onboarded: true, notifyAsk: yes ? 'yes' : 'no', seenNews: NEWS.id });
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
    setTab('history');
    setSessionRequest(null);
    // Tick the day's session off the plan, and let pain ease the days ahead.
    try {
      const run = await getRun(runId);
      if (run) {
        const r = await onRunSaved(run, extra?.pain ?? null, extra?.sessionId ?? null);
        if (r.advice) Alert.alert('Noted', r.advice);
      }
    } catch {
      // no plan, or nothing to change
    }
    setPlanKey((k) => k + 1);
    rescheduleReminders({ ...settings })
      .then(() => schedulePlanReminders(settings))
      .catch(() => {});
  }

  const inkMode = liveRun && tab === 'run';
  return (
    <SafeAreaView style={[styles.root, inkMode && styles.rootInk]}>
      <StatusBar style={inkMode ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/* RunScreen stays mounted so a live run survives tab switches. */}
        <View style={[{ flex: 1 }, tab !== 'run' && styles.hidden]}>
          <RunScreen onSaved={onSaved} requested={sessionRequest} onRequestTaken={() => setSessionRequest(null)} planKey={planKey} />
        </View>
        {tab === 'train' && (
          <TrainScreen
            refreshKey={planKey + refreshKey}
            onChanged={() => setPlanKey((k) => k + 1)}
            onStartSession={(s) => {
              setSessionRequest(s);
              setTab('run');
            }}
          />
        )}
        {tab === 'history' && openRun == null && (
          <HistoryScreen
            onOpen={(id) => {
              setShareOpen(false);
              setOpenRun(id);
            }}
            refreshKey={refreshKey}
          />
        )}
        {tab === 'history' && openRun != null && (
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
          />
        )}
        {tab === 'listen' && <ListenScreen />}
        {tab === 'settings' && <SettingsScreen onOpenListen={() => setTab('listen')} />}
      </View>
      {!liveRun && (
        <View style={styles.tabs}>
          <TabButton label="Run" color={colors.mint} active={tab === 'run'} onPress={() => setTab('run')} />
          <TabButton label="Train" color={colors.butter} active={tab === 'train'} onPress={() => setTab('train')} />
          <TabButton
            label="History"
            color={colors.lilac}
            active={tab === 'history'}
            onPress={() => {
              setOpenRun(null);
              setTab('history');
            }}
          />
          <TabButton label="Listen" color={colors.butter} active={tab === 'listen'} onPress={() => setTab('listen')} />
          <TabButton label="Settings" color={colors.peach} active={tab === 'settings'} onPress={() => setTab('settings')} />
        </View>
      )}
    </SafeAreaView>
  );
}

function TabButton({ label, color, active, onPress }: { label: string; color: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tab}>
      <View style={[styles.tabDot, { backgroundColor: active ? colors.ink : color }]} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  rootInk: { backgroundColor: colors.ink },
  hidden: { display: 'none' },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.cream, paddingTop: 8, paddingBottom: spacing.sm + 2 },
  tab: { alignItems: 'center', gap: 5, minWidth: 72, paddingVertical: 6 },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  tabTextActive: { color: colors.text },
});
