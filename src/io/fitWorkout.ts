// A planned session as a FIT workout file (file type 5): what Garmin, Coros,
// Suunto and others load onto a watch so it can guide the steps itself.
// Pure: no imports from the app, the caller passes names and targets in.
//
// Layout: file_id, workout (sport running, name, step count), then one
// workout_step per step. Runs of identical steps ("6 × 3 min hard, 2 min
// jog") fold into a repeat step, so long interval sessions stay under the
// step limits some watches have.

import { fitCrc } from './fit';

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z
const MSG = { fileId: 0, workout: 26, workoutStep: 27 } as const;

/** FIT intensity: what the watch shows the step as. */
export type Intensity = 'active' | 'rest' | 'warmup' | 'cooldown' | 'recovery';
const INTENSITY: Record<Intensity, number> = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 };

export type WorkoutTarget =
  | { kind: 'pace'; slowSPerKm: number; fastSPerKm: number } // seconds per km, slow > fast
  | { kind: 'heart'; low: number; high: number } // bpm
  | null;

export interface WorkoutStepIn {
  name: string;
  intensity: Intensity;
  durationS?: number; // one of the two; neither means "until you press lap"
  distanceM?: number;
  target: WorkoutTarget;
}

export interface WorkoutIn {
  name: string;
  createdAt: number; // epoch ms
  steps: WorkoutStepIn[];
}

/** A step as written: a plain step, or "repeat steps from..to, n times" placed after them. */
export type OutStep = { step: WorkoutStepIn } | { repeatFrom: number; times: number };

const sameStep = (a: WorkoutStepIn, b: WorkoutStepIn) =>
  a.name === b.name &&
  a.intensity === b.intensity &&
  a.durationS === b.durationS &&
  a.distanceM === b.distanceM &&
  JSON.stringify(a.target) === JSON.stringify(b.target);

/**
 * Folds back-to-back repeats of a block of one to four steps into the block
 * plus a repeat step. Greedy, longest cover first; the last rep's trailing jog
 * that is often left off stays as a plain step after the repeat.
 */
export function foldRepeats(steps: WorkoutStepIn[]): OutStep[] {
  const out: OutStep[] = [];
  let i = 0;
  while (i < steps.length) {
    let best = { len: 0, times: 1 };
    for (let len = 1; len <= 4 && i + len * 2 <= steps.length; len++) {
      let times = 1;
      while (i + len * (times + 1) <= steps.length && steps.slice(i, i + len).every((s, k) => sameStep(s, steps[i + len * times + k]))) times++;
      if (times >= 2 && len * times > best.len * best.times) best = { len, times };
    }
    if (best.len === 0) {
      out.push({ step: steps[i] });
      i++;
      continue;
    }
    const from = out.length;
    for (let k = 0; k < best.len; k++) out.push({ step: steps[i + k] });
    out.push({ repeatFrom: from, times: best.times });
    i += best.len * best.times;
  }
  return out;
}

type Field = [num: number, base: number, size: number, write: (v: DataView, at: number) => void];

const u8 = (num: number, v: number): Field => [num, 0x00, 1, (d, at) => d.setUint8(at, v)];
const u16 = (num: number, v: number): Field => [num, 0x84, 2, (d, at) => d.setUint16(at, v, true)];
const u32 = (num: number, v: number): Field => [num, 0x86, 4, (d, at) => d.setUint32(at, v >>> 0, true)];

/** A FIT string: UTF-8, cut on a character boundary to fit `max` bytes with its closing zero. */
function str(num: number, s: string, max: number): Field {
  const enc = new TextEncoder();
  let bytes = enc.encode(s);
  if (bytes.length > max - 1) {
    let cut = '';
    for (const ch of s) {
      if (enc.encode(cut + ch).length > max - 1) break;
      cut += ch;
    }
    bytes = enc.encode(cut);
  }
  const size = bytes.length + 1;
  return [num, 0x07, size, (d, at) => {
    for (let k = 0; k < bytes.length; k++) d.setUint8(at + k, bytes[k]);
    d.setUint8(at + bytes.length, 0);
  }];
}

const speedMmS = (sPerKm: number) => Math.round((1000 / sPerKm) * 1000); // FIT speed: m/s × 1000

function stepFields(index: number, s: OutStep): Field[] {
  if ('repeatFrom' in s) {
    // duration_type 6: repeat until steps complete; value = first step, target = times.
    return [u16(254, index), u8(1, 6), u32(2, s.repeatFrom), u32(4, s.times)];
  }
  const st = s.step;
  const fields: Field[] = [u16(254, index), str(0, st.name, 32)];
  if (st.durationS != null && st.durationS > 0) fields.push(u8(1, 0), u32(2, Math.round(st.durationS * 1000)));
  else if (st.distanceM != null && st.distanceM > 0) fields.push(u8(1, 1), u32(2, Math.round(st.distanceM * 100)));
  else fields.push(u8(1, 5), u32(2, 0)); // open: lap button
  const t = st.target;
  if (t?.kind === 'pace') {
    fields.push(u8(3, 0), u32(4, 0), u32(5, speedMmS(t.slowSPerKm)), u32(6, speedMmS(t.fastSPerKm)));
  } else if (t?.kind === 'heart') {
    // Custom heart rate values above 100 are bpm + 100; up to 100 they would mean % of max.
    fields.push(u8(3, 1), u32(4, 0), u32(5, Math.round(t.low) + 100), u32(6, Math.round(t.high) + 100));
  } else {
    fields.push(u8(3, 2), u32(4, 0));
  }
  fields.push(u8(7, INTENSITY[st.intensity]));
  return fields;
}

/** The workout as FIT bytes, ready to share as a .fit file. */
export function writeFitWorkout(w: WorkoutIn): Uint8Array {
  const steps = foldRepeats(w.steps.filter((s) => (s.durationS ?? 0) > 0 || (s.distanceM ?? 0) > 0));
  const created = Math.max(0, Math.round(w.createdAt / 1000) - FIT_EPOCH_S);
  const messages: Array<{ global: number; fields: Field[] }> = [
    // file_id: type 5 workout, made by "development" (255).
    { global: MSG.fileId, fields: [u8(0, 5), u16(1, 255), u16(2, 0), u32(3, created || 1), u32(4, created)] },
    // workout: sport running (1), number of steps, name.
    { global: MSG.workout, fields: [u8(4, 1), u16(6, steps.length), str(8, w.name, 40)] },
    ...steps.map((s, i) => ({ global: MSG.workoutStep, fields: stepFields(i, s) })),
  ];

  const chunks: Uint8Array[] = [];
  const defined = new Map<number, string>(); // local type → field layout last defined
  for (const m of messages) {
    // Local types: 0 file_id, 1 workout, 2 workout_step. Steps differ in layout
    // (strings, targets), so a step gets a fresh definition when its layout changes.
    const local = m.global === MSG.fileId ? 0 : m.global === MSG.workout ? 1 : 2;
    const layout = m.fields.map(([n, b, s]) => `${n}:${b}:${s}`).join(',');
    if (defined.get(local) !== layout) {
      const def = new Uint8Array(6 + m.fields.length * 3);
      const dv = new DataView(def.buffer);
      def[0] = 0x40 | local;
      def[1] = 0;
      def[2] = 0; // little-endian
      dv.setUint16(3, m.global, true);
      def[5] = m.fields.length;
      m.fields.forEach(([n, b, s], k) => def.set([n, s, b], 6 + k * 3));
      chunks.push(def);
      defined.set(local, layout);
    }
    const size = m.fields.reduce((a, f) => a + f[2], 0);
    const rec = new Uint8Array(1 + size);
    const dv = new DataView(rec.buffer);
    rec[0] = local;
    let at = 1;
    for (const f of m.fields) {
      f[3](dv, at);
      at += f[2];
    }
    chunks.push(rec);
  }

  const dataLen = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(14 + dataLen + 2);
  const v = new DataView(out.buffer);
  out[0] = 14;
  out[1] = 0x10;
  v.setUint16(2, 2132, true);
  v.setUint32(4, dataLen, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  v.setUint16(12, fitCrc(out, 0, 12), true);
  let at = 14;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  v.setUint16(14 + dataLen, fitCrc(out, 0, 14 + dataLen), true);
  return out;
}

/** A file name the watch apps and file managers all accept. */
export function workoutFileName(title: string, date: number): string {
  const day = new Date(date);
  const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `runtrovert-${ymd}${slug ? `-${slug}` : ''}.fit`;
}
