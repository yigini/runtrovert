import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { EFFORTS, LENGTHS, type LightRuns, type LoopMonths, type MonthRange, type NewStreets, type SweetSpot } from '../deepLong';
import { colors, fonts, themedStyles } from '../theme';
import { dateLocale, decimal } from '../i18n/lang';
import { ui } from '../i18n/ui';
import { Legend } from './DeepCharts';

// Charts for deep stats across months. Same rules as the one-run charts: ink for
// you, blue and orange for better and worse, one lilac ramp for "how much",
// nothing animated, and every chart hidden from screen readers because the card
// around it says the same thing in words.

const hide = { importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

function useWidth(): [number, (e: { nativeEvent: { layout: { width: number } } }) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

export const monthName = (t: number) => new Date(t).toLocaleDateString(dateLocale(), { month: 'short' });

function MonthAxis({ months }: { months: number[] }) {
  return (
    <View style={styles.axisRow} {...hide}>
      {months.map((m) => (
        <Text key={m} style={[styles.axis, { flex: 1, textAlign: 'center' }]}>
          {monthName(m)}
        </Text>
      ))}
    </View>
  );
}

// ---- M1, M2: a dot and a range for each month ------------------------------------------

/** `better` says which way is good: 'up' draws bigger values higher. */
export function MonthRangeChart({ months, better }: { months: MonthRange[]; better: 'up' | 'down' }) {
  const [w, onLayout] = useWidth();
  const h = 110;
  const vals = months.flatMap((m) => [m.lo, m.hi, m.mid]).filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 1;
  const y = better === 'up' ? lin(lo - pad, hi + pad, h - 6, 6) : lin(lo - pad, hi + pad, 6, h - 6);
  const col = w / months.length;
  const x = (i: number) => col * i + col / 2;
  const shown = months.map((m, i) => ({ m, i })).filter(({ m }) => m.mid != null);
  const line = shown.map(({ m, i }, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.mid!).toFixed(1)}`).join(' ');
  return (
    <View style={{ gap: 4 }}>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Path d={line} stroke={colors.ring} strokeWidth={1.5} fill="none" />
            {shown.map(({ m, i }) => (
              <React.Fragment key={m.month}>
                {m.lo != null && m.hi != null && <Line x1={x(i)} x2={x(i)} y1={y(m.lo)} y2={y(m.hi)} stroke={colors.seq2} strokeWidth={7} strokeLinecap="round" />}
                <Circle cx={x(i)} cy={y(m.mid!)} r={5} fill={colors.text} stroke={colors.white} strokeWidth={2} />
              </React.Fragment>
            ))}
          </Svg>
        )}
      </View>
      <MonthAxis months={months.map((m) => m.month)} />
    </View>
  );
}

// ---- M3: new streets -----------------------------------------------------------------------

export function StreetsChart({ streets }: { streets: NewStreets }) {
  const [w, onLayout] = useWidth();
  const h = 100;
  const max = Math.max(...streets.months.map((m) => m.newM + m.knownM), 1);
  const col = w / streets.months.length;
  const bw = Math.min(28, col * 0.55);
  const y = lin(0, max, h, 4);
  return (
    <View style={{ gap: 4 }}>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            {streets.months.map((m, i) => {
              const cx = col * i + (col - bw) / 2;
              const knownTop = y(m.knownM);
              const allTop = y(m.knownM + m.newM);
              return (
                <React.Fragment key={m.month}>
                  {m.knownM > 0 && <Rect x={cx} y={knownTop} width={bw} height={h - knownTop} rx={4} fill={colors.seq1} />}
                  {m.newM > 0 && <Rect x={cx} y={allTop} width={bw} height={Math.max(2, knownTop - allTop - (m.knownM > 0 ? 2 : 0))} rx={4} fill={colors.chartQuick} />}
                </React.Fragment>
              );
            })}
          </Svg>
        )}
      </View>
      <MonthAxis months={streets.months.map((m) => m.month)} />
      <Legend items={[{ c: colors.chartQuick, t: ui().deepLong.streetsNew }, { c: colors.seq1, t: ui().deepLong.streetsKnown }]} />
    </View>
  );
}

// ---- M4: following the light ---------------------------------------------------------------

const DAY_FROM = 4 * 60;
const DAY_TO = 23 * 60;

export function LightChart({ light }: { light: LightRuns }) {
  const [w, onLayout] = useWidth();
  const h = 150;
  const left = 34;
  const x = lin(365, 0, left, w - 4);
  const y = (min: number) => lin(DAY_FROM, DAY_TO, 4, h - 4)(Math.max(DAY_FROM, Math.min(DAY_TO, min)));
  const weeks = light.weeks.filter((k) => k.sunrise != null && k.sunset != null);
  const top = weeks.map((k, i) => `${i ? 'L' : 'M'}${x(k.daysAgo).toFixed(1)},${y(k.sunrise!).toFixed(1)}`).join(' ');
  const bottom = weeks.map((k, i) => `${i ? 'L' : 'M'}${x(k.daysAgo).toFixed(1)},${y(k.sunset!).toFixed(1)}`).join(' ');
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return (
    <View onLayout={onLayout} style={{ height: h }} {...hide}>
      {w > 0 && weeks.length > 1 && (
        <Svg width={w} height={h}>
          <Path d={`${top} L${x(last.daysAgo)},4 L${x(first.daysAgo)},4 Z`} fill={colors.lilacSoft} />
          <Path d={`${bottom} L${x(last.daysAgo)},${h - 4} L${x(first.daysAgo)},${h - 4} Z`} fill={colors.lilacSoft} />
          <Path d={top} stroke={colors.ring} strokeWidth={1} fill="none" />
          <Path d={bottom} stroke={colors.ring} strokeWidth={1} fill="none" />
          {light.runs.map((r, i) => (
            <Circle key={i} cx={x(r.daysAgo)} cy={y(r.minute)} r={3} fill={colors.text} opacity={0.85} />
          ))}
        </Svg>
      )}
      {[6, 12, 18].map((hh) => (
        <Text key={hh} style={[styles.axis, { position: 'absolute', left: 0, top: y(hh * 60) - 7 }]}>
          {String(hh).padStart(2, '0')}:00
        </Text>
      ))}
    </View>
  );
}

// ---- M5: your energy sweet spot --------------------------------------------------------------

function liftTone(lift: number): { bg: string; opacity: number } {
  if (Math.abs(lift) < 0.25) return { bg: colors.empty, opacity: 1 };
  const strength = Math.min(1, Math.abs(lift) / 1.5);
  return { bg: lift > 0 ? colors.chartQuick : colors.chartSlow, opacity: 0.2 + strength * 0.45 };
}

export const liftText = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${decimal(Math.abs(n).toFixed(1))}`;

export function SweetGrid({ sweet }: { sweet: SweetSpot }) {
  const L = ui().deepLong;
  return (
    <View style={{ gap: 4 }} {...hide}>
      <View style={styles.gridRow}>
        <View style={styles.gridHead} />
        {EFFORTS.map((e) => (
          <Text key={e} style={[styles.axis, styles.gridCol, { textAlign: 'center' }]} numberOfLines={2}>
            {L.efforts[e]}
          </Text>
        ))}
      </View>
      {LENGTHS.map((l) => (
        <View key={l} style={styles.gridRow}>
          <Text style={[styles.axis, styles.gridHead]} numberOfLines={2}>
            {L.lengths[l]}
          </Text>
          {EFFORTS.map((e) => {
            const c = sweet.cells[l][e];
            const best = sweet.best && sweet.best.length === l && sweet.best.effort === e;
            if (c.lift == null)
              return (
                <View key={e} style={[styles.gridCol, styles.cell, styles.cellEmpty]}>
                  <Text style={styles.cellFew}>{c.n > 0 ? L.tooFew : '–'}</Text>
                </View>
              );
            const tone = liftTone(c.lift);
            return (
              <View key={e} style={[styles.gridCol, styles.cell, best && styles.cellBest]}>
                <View style={[StyleFill, { backgroundColor: tone.bg, opacity: tone.opacity }]} />
                <Text style={styles.cellText}>{liftText(c.lift)}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const StyleFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, borderRadius: 6 };

// ---- M6: your loop, settling -------------------------------------------------------------------

export function LoopStrip({ loop }: { loop: LoopMonths }) {
  const [w, onLayout] = useWidth();
  const rows = loop.months.filter((m) => m.times.length > 0);
  const all = rows.flatMap((m) => m.times);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max(10, (hi - lo) * 0.08);
  const left = 44;
  const x = lin(lo - pad, hi + pad, left, w - 6);
  const rh = 22;
  const h = rows.length * rh;
  return (
    <View onLayout={onLayout} style={{ height: h }} {...hide}>
      {w > 0 && (
        <Svg width={w} height={h}>
          {rows.map((m, i) => {
            const cy = i * rh + rh / 2;
            return (
              <React.Fragment key={m.month}>
                <Line x1={left} x2={w - 6} y1={cy} y2={cy} stroke={colors.line} strokeWidth={1} />
                {m.times.map((t, k) => (
                  <Circle key={k} cx={x(t)} cy={cy} r={4} fill={colors.text} opacity={0.75} />
                ))}
                {m.mid != null && <Line x1={x(m.mid)} x2={x(m.mid)} y1={cy - 8} y2={cy + 8} stroke={colors.chartSlow} strokeWidth={2.5} strokeLinecap="round" />}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      {rows.map((m, i) => (
        <Text key={m.month} style={[styles.axis, { position: 'absolute', left: 0, top: i * rh + rh / 2 - 7 }]}>
          {monthName(m.month)}
        </Text>
      ))}
    </View>
  );
}

// ---- V5: groups as dots and ranges -----------------------------------------------------------------

/** One row's range bar on a scale shared by its card. Quicker is to the right. */
export function RangeBar({ pace, lo, hi, min, max, tone }: { pace: number | null; lo?: number | null; hi?: number | null; min: number; max: number; tone?: string }) {
  if (pace == null) return null;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((max - v) / (max - min || 1)) * 100))}%` as const;
  return (
    <View style={styles.rangeTrack} {...hide}>
      {lo != null && hi != null ? (
        <View style={[styles.range, { left: pos(hi), right: `${100 - parseFloat(pos(lo))}%` as const }]} />
      ) : null}
      <View style={[styles.rangeDot, { left: pos(pace), backgroundColor: tone ?? colors.text }]} />
    </View>
  );
}

const styles = themedStyles(() => ({
  axisRow: { flexDirection: 'row' },
  axis: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridHead: { width: 78 },
  gridCol: { flex: 1 },
  cell: { height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellEmpty: { backgroundColor: colors.sunk },
  cellBest: { borderWidth: 2, borderColor: colors.text },
  cellText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  cellFew: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  rangeTrack: { height: 12, justifyContent: 'center', marginTop: 2 },
  range: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.seq2 },
  rangeDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, borderWidth: 1.5, borderColor: colors.white },
}));

