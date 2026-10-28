import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Fraunces_300Light, Fraunces_400Regular_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { discardUnfinishedRuns } from './src/db';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { RunDetailScreen } from './src/screens/RunDetailScreen';
import { RunScreen } from './src/screens/RunScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { notifyAfterRun, rescheduleReminders } from './src/notify';
import { SettingsProvider, useSettings } from './src/settings';
import { recoverRun, subscribe } from './src/tracking';
import { colors, fonts, spacing } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Tab = 'run' | 'history' | 'settings';

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveRun, setLiveRun] = useState(false);
  useEffect(() => subscribe((t) => setLiveRun(t.status !== 'idle')), []);

  useEffect(() => {
    // If the app was killed mid-run, pick the run back up; otherwise tidy strays.
    recoverRun()
      .then((restored) => {
        if (!restored) return discardUnfinishedRuns();
      })
      .catch(() => {});
  }, []);

  // Lay out the next weeks of reminders each time the app opens (context may have changed).
  useEffect(() => {
    if (ready && settings.onboarded) rescheduleReminders(settings).catch(() => {});
  }, [ready, settings.onboarded]);

  if (!ready) return <SafeAreaView style={styles.root} />;
  if (!settings.onboarded) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <WelcomeScreen onDone={() => update({ onboarded: true })} />
      </SafeAreaView>
    );
  }

  function onSaved(runId: number) {
    notifyAfterRun(settings);
    rescheduleReminders({ ...settings });
    setRefreshKey((k) => k + 1);
    setOpenRun(runId);
    setTab('history');
  }

  const inkMode = liveRun && tab === 'run';
  return (
    <SafeAreaView style={[styles.root, inkMode && styles.rootInk]}>
      <StatusBar style={inkMode ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/* RunScreen stays mounted so a live run survives tab switches. */}
        <View style={[{ flex: 1 }, tab !== 'run' && styles.hidden]}>
          <RunScreen onSaved={onSaved} />
        </View>
        {tab === 'history' && openRun == null && <HistoryScreen onOpen={setOpenRun} refreshKey={refreshKey} />}
        {tab === 'history' && openRun != null && (
          <RunDetailScreen
            runId={openRun}
            onBack={() => setOpenRun(null)}
            onDeleted={() => {
              setOpenRun(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      {!liveRun && (
        <View style={styles.tabs}>
          <TabButton label="Run" color={colors.mint} active={tab === 'run'} onPress={() => setTab('run')} />
          <TabButton
            label="History"
            color={colors.lilac}
            active={tab === 'history'}
            onPress={() => {
              setOpenRun(null);
              setTab('history');
            }}
          />
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
  tabs: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.cream, paddingTop: 10, paddingBottom: spacing.md },
  tab: { alignItems: 'center', gap: 4, minWidth: 72 },
  tabDot: { width: 36, height: 36, borderRadius: 18 },
  tabText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.muted },
  tabTextActive: { color: colors.text },
});
