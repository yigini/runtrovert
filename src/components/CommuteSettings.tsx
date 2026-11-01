import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { MAX_APART_M, metres, MIN_APART_M, type Nudges } from '../commute';
import { saveCommute, useCommute } from '../commuteStore';
import { colors, fonts, spacing, themedStyles } from '../theme';
import { Group, kit, Note, PlainRow, Row, RowButton, RowLink, Segmented } from './SettingsKit';
import type { LatLon } from '../types';
import { ui } from '../i18n/ui';
import { SpotSheet } from './SpotSheet';

const NUDGES: Nudges[] = ['off', 'morning', 'afternoon', 'both'];

function nudgeLabel(n: Nudges): string {
  return n === 'off' ? ui().commute.off : n === 'morning' ? ui().commute.mornings : n === 'afternoon' ? ui().commute.afternoons : ui().commute.both;
}

/**
 * Settings > Home and work. Two spots, kept on the phone (src/commuteStore.ts),
 * and the weekday notes about them. The body of its own Settings page.
 */
export function CommuteSettings() {
  const c = useCommute();
  const [editing, setEditing] = useState<'home' | 'work' | null>(null);
  if (!c) return null;
  const apart = c.home && c.work ? metres(c.home, c.work) : null;
  const warning = apart == null ? null : apart < MIN_APART_M ? ui().commute.tooClose : apart > MAX_APART_M ? ui().commute.tooFar : null;
  const both = !!(c.home && c.work) && !warning;

  return (
    <View style={{ gap: spacing.md }}>
      <Note strong>{ui().commute.intro}</Note>
      <Group>
        <SpotRow label={ui().commute.home} spot={c.home} onSet={() => setEditing('home')} onForget={() => saveCommute({ home: null })} />
        <SpotRow label={ui().commute.work} spot={c.work} onSet={() => setEditing('work')} onForget={() => saveCommute({ work: null })} />
      </Group>
      {warning ? <Text style={styles.warning}>{warning}</Text> : null}
      {both ? (
        <Group>
          <Row stack label={ui().commute.nudgeLabel} hint={ui().commute.nudgeHint}>
            <Segmented value={c.nudges} options={NUDGES} labels={Object.fromEntries(NUDGES.map((n) => [n, nudgeLabel(n)]))} onChange={(n) => saveCommute({ nudges: n as Nudges })} accessibilityLabel={ui().commute.nudgeLabel} />
          </Row>
        </Group>
      ) : null}
      <Note>{ui().commute.privacy}</Note>
      <SpotSheet
        open={editing != null}
        title={editing === 'work' ? ui().commute.whereWork : ui().commute.whereHome}
        initial={editing === 'work' ? c.work : editing === 'home' ? c.home : null}
        onClose={() => setEditing(null)}
        onSave={(p) => {
          if (editing) saveCommute({ [editing]: p }).catch(() => {});
          setEditing(null);
        }}
      />
    </View>
  );
}

function SpotRow({ label, spot, onSet, onForget }: { label: string; spot: LatLon | null; onSet: () => void; onForget: () => void }) {
  return (
    <PlainRow>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Text style={kit.label}>{label}</Text>
        <Text style={kit.hint}>{spot ? ui().commute.savedHere : ui().commute.notSet}</Text>
      </View>
      {spot ? <RowLink label={ui().commute.forget} onPress={onForget} accessibilityLabel={ui().commute.forgetX(label)} /> : null}
      <RowButton label={spot ? ui().commute.change : ui().commute.set} onPress={onSet} accessibilityLabel={spot ? ui().commute.changeX(label) : ui().commute.setX(label)} />
    </PlainRow>
  );
}

const styles = themedStyles(() => ({
  warning: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.peachDeep, paddingHorizontal: spacing.xs },
}));
