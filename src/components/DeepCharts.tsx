import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { CornersCost, GpsSure, HeartLag, HillPrice, StopsCost, Sure, Turn } from '../deepMore';
import { formatDistance, MILE_M } from '../geo';
import { colors, fonts, radius, spacing, type, themedStyles } from '../theme';
import { useSettings } from '../settings';
import { ui } from '../i18n/ui';

// The charts inside "Show me everything", and the folding groups they sit in.
// Restrained on purpose: one colour per job (ink for your run, blue for quicker,
// orange for slower, one lilac ramp for "how much"), thin marks, no animation.
// Every chart is hidden from screen readers and its facts are said in words by
// the card around it.

const hide = { importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

function useWidth(): [number, (e: { nativeEvent: { layout: { width: number } } }) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
const pathOf = (pts: Array<[number, number]>) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

export function paceText(sPerKm: number, km: boolean): string {
  const s = km ? sPerKm : (sPerKm * MILE_M) / 1000;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`;
}

// ---- A folding group -------------------------------------------------------------------

/** A group header with a one-line headline; tap to open. Which groups are open is remembered. */
export function Group({ id, title, headline, children }: { id: string; title: string; headline?: string | null; children: React.ReactNode }) {
  const { settings, update } = useSettings();
  const openList = settings.deepOpen ?? [];
  const open = openList.includes(id);
  const toggle = () => update({ deepOpen: open ? openList.filter((x) => x !== id) : [...openList, id] });
  return (
    <View style={styles.group}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={[title, headline].filter(Boolean).join('. ')}
        accessibilityHint={ui().deepMore.groupHint}
        style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.groupTitle}>{title}</Text>
          {headline ? <Text style={styles.groupLine}>{headline}</Text> : null}
        </View>
        <Text style={styles.chevron} {...hide}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={{ gap: spacing.sm, paddingTop: spacing.xs }}>{children}</View> : null}
    </View>
  );
}

// ---- R3: where the pace turned ----------------------------------------------------------

export function TurnChart({ turn }: { turn: Turn }) {
  const [w, onLayout] = useWidth();
  const h = 96;
  const s = turn.series;
  const paces = s.map((p) => p.pace).sort((a, b) => a - b);
  const lo = paces[Math.floor(paces.length * 0.05)] - 6;
  const hi = paces[Math.ceil(paces.length * 0.95) - 1] + 6;
  const x = lin(0, s[s.length - 1].d + 125, 4, w - 4);
  const y = (p: number) => lin(lo, hi, 8, h - 8)(Math.max(lo, Math.min(hi, p)));
  const raw = pathOf(s.map((p) => [x(p.d), y(p.pace)]));
  return (
    <View onLayout={onLayout} style={{ height: h }} {...hide}>
      {w > 0 && (
        <Svg width={w} height={h}>
          <Path d={raw} stroke={colors.ring} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
          {turn.kind === 'faded' ? (
            <>
              <Line x1={x(s[0].d)} x2={x(turn.atM)} y1={y(turn.holdPace)} y2={y(turn.holdPace)} stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" />
              <Line x1={x(turn.atM)} x2={x(s[s.length - 1].d)} y1={y(turn.holdPace)} y2={y(turn.endPace)} stroke={colors.chartSlow} strokeWidth={2.5} strokeLinecap="round" />
              <Line x1={x(turn.atM)} x2={x(turn.atM)} y1={0} y2={h} stroke={colors.text} strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
              <Circle cx={x(turn.atM)} cy={y(turn.holdPace)} r={5} fill={colors.text} stroke={colors.white} strokeWidth={2} />
            </>
          ) : (
            <Line x1={x(s[0].d)} x2={x(s[s.length - 1].d)} y1={y(turn.pace)} y2={y(turn.pace)} stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" />
          )}
        </Svg>
      )}
    </View>
  );
}

// ---- R4: your hill price ------------------------------------------------------------------

export function HillChart({ hill }: { hill: HillPrice }) {
  const [w, onLayout] = useWidth();
  const h = 150;
  const gs = hill.dots.map((d) => d.g);
  const gMax = Math.max(4, ...gs.map(Math.abs));
  const dps = hill.dots.map((d) => d.dp);
  const top = Math.max(20, ...dps);
  const bottom = Math.min(-20, ...dps);
  const x = lin(-gMax, gMax, 6, w - 6);
  const y = lin(bottom, top, h - 6, 6);
  return (
    <View onLayout={onLayout} style={{ height: h }} {...hide}>
      {w > 0 && (
        <Svg width={w} height={h}>
          <Line x1={x(0)} x2={x(0)} y1={0} y2={h} stroke={colors.line} strokeWidth={1} />
          <Line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke={colors.line} strokeWidth={1} />
          {hill.dots.map((d, i) => (
            <Circle key={i} cx={x(d.g)} cy={y(d.dp)} r={3} fill={d.g >= 1 ? colors.chartSlow : d.g <= -1 ? colors.chartQuick : colors.ring} opacity={0.75} />
          ))}
          {hill.upS != null && <Line x1={x(0)} y1={y(0)} x2={x(gMax)} y2={y(Math.min(top, hill.upS * gMax))} stroke={colors.text} strokeWidth={2} strokeLinecap="round" />}
          {hill.downS != null && <Line x1={x(0)} y1={y(0)} x2={x(-gMax)} y2={y(Math.max(bottom, -hill.downS * gMax))} stroke={colors.text} strokeWidth={2} strokeLinecap="round" />}
        </Svg>
      )}
      <View style={styles.axisRow}>
        <Text style={styles.axis}>−{Math.round(gMax)}%</Text>
        <Text style={styles.axis}>0%</Text>
        <Text style={styles.axis}>+{Math.round(gMax)}%</Text>
      </View>
    </View>
  );
}

// ---- R1: what stopping cost -----------------------------------------------------------------

export function StopsChart({ stops, totalM }: { stops: StopsCost; totalM: number }) {
  const [w, onLayout] = useWidth();
  const h = 80;
  const max = Math.max(...stops.stops.map((s) => s.standS + s.restartS), 10);
  const x = lin(0, totalM, 6, w - 6);
  const y = lin(0, max, h - 2, 4);
  const bw = 8;
  return (
    <View style={{ gap: 6 }}>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Line x1={0} x2={w} y1={h - 1} y2={h - 1} stroke={colors.line} strokeWidth={1} />
            {stops.stops.map((s, i) => {
              const cx = x(s.atM) - bw / 2;
              const standTop = y(Math.min(s.standS, max));
              const allTop = y(Math.min(s.standS + s.restartS, max));
              return (
                <React.Fragment key={i}>
                  <Rect x={cx} y={standTop} width={bw} height={Math.max(2, h - 1 - standTop)} rx={3} fill={colors.text} />
                  {s.restartS > 0 && <Rect x={cx} y={allTop} width={bw} height={Math.max(2, standTop - allTop - 2)} rx={3} fill={colors.chartSlow} />}
                </React.Fragment>
              );
            })}
          </Svg>
        )}
      </View>
      <Legend items={[{ c: colors.text, t: ui().deepMore.standing }, { c: colors.chartSlow, t: ui().deepMore.backToSpeed }]} />
    </View>
  );
}

// ---- R2: what corners cost -------------------------------------------------------------------

export function CornersShape({ corners }: { corners: CornersCost }) {
  const [w, onLayout] = useWidth();
  const pts = corners.shape;
  const lat0 = pts[0].lat;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * kx);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const pad = 14;
  const h = w > 0 ? Math.min(180, Math.max(90, ((w - 2 * pad) * spanY) / spanX + 2 * pad)) : 140;
  const k = w > 0 ? Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY) : 1;
  const ox = (w - spanX * k) / 2;
  const oy = (h - spanY * k) / 2;
  const P = (lat: number, lon: number): [number, number] => [ox + (lon * kx - minX) * k, oy + (-lat - minY) * k];
  const maxCost = Math.max(...corners.corners.map((c) => c.costS), 1);
  return (
    <View onLayout={onLayout} style={{ height: h }} {...hide}>
      {w > 0 && (
        <Svg width={w} height={h}>
          <Path d={pathOf(pts.map((p) => P(p.lat, p.lon)))} stroke={colors.ring} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {corners.corners.map((c, i) => {
            const [cx, cy] = P(c.lat, c.lon);
            return <Circle key={i} cx={cx} cy={cy} r={2.5 + Math.sqrt(c.costS / maxCost) * 8} fill={colors.chartSlow} opacity={0.85} stroke={colors.white} strokeWidth={1.5} />;
          })}
          {(() => {
            const [sx, sy] = P(pts[0].lat, pts[0].lon);
            return <Circle cx={sx} cy={sy} r={4} fill={colors.text} stroke={colors.white} strokeWidth={1.5} />;
          })()}
        </Svg>
      )}
    </View>
  );
}

// ---- R6: heart and pace together -------------------------------------------------------------

export function HeartPathChart({ path }: { path: Array<{ pace: number; bpm: number }> }) {
  const [w, onLayout] = useWidth();
  const h = 150;
  const paces = path.map((p) => p.pace).sort((a, b) => a - b);
  const pLo = paces[Math.floor(paces.length * 0.03)];
  const pHi = paces[Math.ceil(paces.length * 0.97) - 1];
  const bpms = path.map((p) => p.bpm);
  const bLo = Math.min(...bpms) - 2;
  const bHi = Math.max(...bpms) + 2;
  // Quicker is to the right: the slow end of pace on the left.
  const x = (p: number) => lin(pHi + 3, pLo - 3, 8, w - 8)(Math.max(pLo - 3, Math.min(pHi + 3, p)));
  const y = lin(bLo, bHi, h - 8, 8);
  const ramp = [colors.seq1, colors.seq2, colors.seq3, colors.seq4];
  const q = Math.ceil(path.length / 4);
  const pts = path.map((p) => [x(p.pace), y(p.bpm)] as [number, number]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return (
    <View style={{ gap: 6 }}>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            {[0, 1, 2, 3].map((k) => (
              <Path key={k} d={pathOf(pts.slice(k * q, Math.min(pts.length, (k + 1) * q + 1)))} stroke={ramp[k]} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            <Circle cx={first[0]} cy={first[1]} r={4.5} fill={ramp[0]} stroke={colors.white} strokeWidth={2} />
            <Circle cx={last[0]} cy={last[1]} r={4.5} fill={ramp[3]} stroke={colors.white} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <Legend items={[{ c: ramp[0], t: ui().deepMore.start }, { c: ramp[3], t: ui().deepMore.end }]} />
    </View>
  );
}

// ---- R5: heart catch-up ------------------------------------------------------------------------

export function LagChart({ lag }: { lag: HeartLag }) {
  const [w, onLayout] = useWidth();
  const h = 70;
  const rs = lag.curve.map((c) => c.r);
  const x = lin(0, 60, 4, w - 4);
  const y = lin(Math.min(0, ...rs), Math.max(...rs), h - 4, 6);
  return (
    <View>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            <Line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke={colors.line} strokeWidth={1} />
            <Path d={pathOf(lag.curve.map((c) => [x(c.lag), y(c.r)]))} stroke={colors.text} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Line x1={x(lag.lagS)} x2={x(lag.lagS)} y1={0} y2={h} stroke={colors.text} strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
            <Circle cx={x(lag.lagS)} cy={y(lag.r)} r={5} fill={colors.chartSlow} stroke={colors.white} strokeWidth={2} />
          </Svg>
        )}
      </View>
      <View style={styles.axisRow} {...hide}>
        <Text style={styles.axis}>{ui().deepMore.seconds('0')}</Text>
        <Text style={styles.axis}>{ui().deepMore.seconds('30')}</Text>
        <Text style={styles.axis}>{ui().deepMore.seconds('60')}</Text>
      </View>
    </View>
  );
}

// ---- R7: how sure the GPS was ---------------------------------------------------------------------

const SURE_ORDER: Sure[] = ['good', 'fair', 'poor', 'gap'];

function sureTone(k: Sure): string {
  return k === 'good' ? colors.seq4 : k === 'fair' ? colors.seq2 : k === 'poor' ? colors.seq1 : 'none';
}

export function GpsStrip({ gps }: { gps: GpsSure }) {
  const [w, onLayout] = useWidth();
  const h = 22;
  const n = gps.pieces.length;
  const cw = w / n;
  // Join neighbours of the same kind into one bar.
  const runs: Array<{ k: Sure; from: number; to: number }> = [];
  gps.pieces.forEach((k, i) => {
    const last = runs[runs.length - 1];
    if (last && last.k === k) last.to = i + 1;
    else runs.push({ k, from: i, to: i + 1 });
  });
  const shown = SURE_ORDER.filter((k) => gps.share[k] > 0.005);
  return (
    <View style={{ gap: 6 }}>
      <View onLayout={onLayout} style={{ height: h }} {...hide}>
        {w > 0 && (
          <Svg width={w} height={h}>
            {runs.map((r, i) => (
              <Rect
                key={i}
                x={r.from * cw + (i ? 1 : 0)}
                y={1}
                width={Math.max(1.5, (r.to - r.from) * cw - (i ? 2 : 0))}
                height={h - 2}
                rx={4}
                fill={r.k === 'gap' ? colors.white : sureTone(r.k)}
                stroke={r.k === 'gap' ? colors.inkMuted : 'none'}
                strokeDasharray={r.k === 'gap' ? '3 3' : undefined}
                strokeWidth={r.k === 'gap' ? 1.5 : 0}
              />
            ))}
          </Svg>
        )}
      </View>
      <Legend items={shown.map((k) => ({ c: k === 'gap' ? 'dashed' : sureTone(k), t: `${ui().deepMore.gpsKinds[k]} · ${Math.round(gps.share[k] * 100)}%` }))} />
    </View>
  );
}

// ---- V2: heart zones as one bar --------------------------------------------------------------------

export function ZonesBar({ seconds, tones, names }: { seconds: number[]; tones: string[]; names: string[] }) {
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.zoneBar} {...hide}>
        {seconds.map((s, i) =>
          s > 0 ? <View key={i} style={{ flex: s / total, backgroundColor: tones[i], borderRadius: 4, minWidth: 3 }} /> : null,
        )}
      </View>
      <View style={styles.zoneKey}>
        {seconds.map((s, i) => (
          <View key={i} style={styles.zoneItem} {...hide}>
            <View style={[styles.swatch, { backgroundColor: tones[i] }]} />
            <Text style={styles.legendText}>
              {names[i]} · {ui().common.min(Math.round(s / 60))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Bits -------------------------------------------------------------------------------------------

export function Legend({ items }: { items: Array<{ c: string; t: string }> }) {
  return (
    <View style={styles.legend} {...hide}>
      {items.map((it) => (
        <View key={it.t} style={styles.zoneItem}>
          <View style={[styles.swatch, it.c === 'dashed' ? styles.dashed : { backgroundColor: it.c }]} />
          <Text style={styles.legendText}>{it.t}</Text>
        </View>
      ))}
    </View>
  );
}

export const distanceAt = (m: number, km: boolean) => formatDistance(m, km);

const styles = themedStyles(() => ({
  group: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  groupTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  groupLine: { ...type.small },
  chevron: { fontFamily: fonts.body, fontSize: 22, color: colors.inkMuted, width: 24, textAlign: 'center' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axis: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  zoneBar: { flexDirection: 'row', gap: 2, height: 18 },
  zoneKey: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  zoneItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.inkMuted },
}));
