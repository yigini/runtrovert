import React, { useEffect, useState } from 'react';
import { Alert, AppState, Switch, Text, View } from 'react-native';
import { askHealth, bringInFromHealth, healthGranted, healthStatus, openHealthSettings, openHealthStore, writeAllRuns, type HealthStatus } from '../health';
import { importLine } from '../io/shape';
import { useSettings } from '../settings';
import { switchColors } from '../theme';
import { Group, kit, Note, PlainRow, Row, RowButton, WideButton } from './SettingsKit';
import { ui } from '../i18n/ui';

/**
 * Settings › Health Connect. One switch to add runs, one button to bring runs
 * in, and the way to Health Connect's own settings. Free; Android 9 and later
 * with Health Connect only (the row isn't shown otherwise).
 */
export function HealthSettings({ onChanged }: { onChanged?: () => void }) {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<HealthStatus>(healthStatus());
  const [busy, setBusy] = useState<'add' | 'bring' | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [said, setSaid] = useState<{ kind: 'add' | 'bring'; text: string } | null>(null);
  const h = ui().health;

  // Back from the Play Store or Health Connect: look again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setStatus(healthStatus());
    });
    return () => sub.remove();
  }, []);

  // Access taken back in Health Connect: the switch shows it.
  useEffect(() => {
    if (status !== 'ok' || !settings.healthConnect) return;
    healthGranted().then((g) => {
      if (!g.write) update({ healthConnect: false });
    });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  function denied() {
    Alert.alert(h.notAllowed, h.notAllowedText, [{ text: ui().train.cancel, style: 'cancel' }, { text: h.openSettings, onPress: openHealthSettings }]);
  }

  async function toggle(on: boolean) {
    if (!on) return update({ healthConnect: false });
    if (status === 'update') return openHealthStore();
    if (await askHealth('write')) update({ healthConnect: true });
    else denied();
  }

  async function addEarlier() {
    setBusy('add');
    setProgress(h.working);
    try {
      const n = await writeAllRuns((done, total) => setProgress(h.progress(done, total)));
      setSaid({ kind: 'add', text: h.added(n) });
    } catch (e) {
      setSaid({ kind: 'add', text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
    }
  }

  async function bringIn() {
    setBusy('bring');
    try {
      const t = await bringInFromHealth();
      if (t == null) denied();
      else {
        setSaid({ kind: 'bring', text: importLine(t) });
        if (t.added) onChanged?.();
      }
    } catch (e) {
      setSaid({ kind: 'bring', text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(null);
    }
  }

  if (status === 'no') return null;

  return (
    <>
      <Note>{h.intro}</Note>
      {status === 'update' ? (
        <Group>
          <Row label={h.needsUpdate}>
            <RowButton label={h.getIt} onPress={openHealthStore} />
          </Row>
        </Group>
      ) : (
        <>
          <Group>
            <Row label={h.addRuns} hint={h.addRunsHint}>
              <Switch value={settings.healthConnect} onValueChange={(v) => void toggle(v)} {...switchColors(settings.healthConnect)} />
            </Row>
            {settings.healthConnect ? <Action label={h.addEarlier} hint={busy === 'add' ? progress : said?.kind === 'add' ? said.text : null} onPress={() => (busy ? undefined : void addEarlier())} /> : null}
          </Group>
          <Group title={h.bringTitle}>
            <Action label={h.bringIn} hint={busy === 'bring' ? h.working : said?.kind === 'bring' ? said.text : h.bringInHint} onPress={() => (busy ? undefined : void bringIn())} />
          </Group>
          <Note>{h.note}</Note>
          <WideButton quiet label={h.openSettings} onPress={openHealthSettings} />
        </>
      )}
    </>
  );
}

/** A row that does something when pressed, with what it did underneath. */
function Action({ label, hint, onPress }: { label: string; hint: string | null; onPress: () => void }) {
  return (
    <PlainRow onPress={onPress} accessibilityLabel={label}>
      <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
        <Text style={kit.label}>{label}</Text>
        {hint ? <Text style={kit.hint}>{hint}</Text> : null}
      </View>
    </PlainRow>
  );
}
