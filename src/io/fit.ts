import { heartAt, heartSummary, type HeartSample } from '../heart';
import type { ImportedRun, ParseResult, TrackPoint } from './types';

// FIT in and out, on the phone. FIT is the binary format Garmin, Coros,
// Suunto, Wahoo and Polar watches write. Only the messages a run needs are
// read: file_id, record, event (timer start/stop), lap and session. Unknown
// messages and developer fields are skipped by size, so newer files still read.

const FIT_EPOCH_S = 631065600; // 1989-12-31T00:00:00Z
const SEMI = 180 / 2 ** 31;

const MSG = { fileId: 0, session: 18, lap: 19, record: 20, event: 21, activity: 34 } as const;

/** FIT sport numbers that count as a run: generic (watch didn't say), running, walking-run hybrids are not. */
const RUN_SPORTS = new Set([0, 1]);
const SPORT_NAMES: Record<number, string> = { 0: 'generic', 1: 'running', 2: 'cycling', 5: 'swimming', 11: 'walking', 17: 'hiking' };

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, crc = 0): number {
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

interface FieldDef {
  num: number;
  size: number;
  base: number;
}
interface Def {
  global: number;
  little: boolean;
  fields: FieldDef[];
  devSize: number;
}

type Fields = Map<number, number | null>;

/** A field's value as a number, or null when it holds FIT's "invalid" marker. Arrays and strings read as null. */
function readValue(view: DataView, at: number, f: FieldDef, little: boolean): number | null {
  const t = f.base & 0x1f;
  switch (t) {
    case 0x00: // enum
    case 0x02: // uint8
    case 0x0a: // uint8z
    case 0x0d: {
      if (f.size !== 1) return null;
      const v = view.getUint8(at);
      return (t === 0x0a ? v === 0 : v === 0xff) ? null : v;
    }
    case 0x01: {
      if (f.size !== 1) return null;
      const v = view.getInt8(at);
      return v === 0x7f ? null : v;
    }
    case 0x03: {
      if (f.size !== 2) return null;
      const v = view.getInt16(at, little);
      return v === 0x7fff ? null : v;
    }
    case 0x04:
    case 0x0b: {
      if (f.size !== 2) return null;
      const v = view.getUint16(at, little);
      return (t === 0x0b ? v === 0 : v === 0xffff) ? null : v;
    }
    case 0x05: {
      if (f.size !== 4) return null;
      const v = view.getInt32(at, little);
      return v === 0x7fffffff ? null : v;
    }
    case 0x06:
    case 0x0c: {
      if (f.size !== 4) return null;
      const v = view.getUint32(at, little);
      return (t === 0x0c ? v === 0 : v === 0xffffffff) ? null : v;
    }
    case 0x08: {
      if (f.size !== 4) return null;
      const v = view.getFloat32(at, little);
      return Number.isFinite(v) ? v : null;
    }
    case 0x09: {
      if (f.size !== 8) return null;
      const v = view.getFloat64(at, little);
      return Number.isFinite(v) ? v : null;
    }
    default:
      return null; // strings, bytes, 64-bit ints: nothing a run needs
  }
}

interface RawSession {
  start: number | null; // epoch ms
  end: number | null;
  elapsedS: number | null;
  timerS: number | null;
  distanceM: number | null;
  ascentM: number | null;
  sport: number | null;
}

interface Raw {
  records: Array<TrackPoint & { dist: number | null }>;
  timer: Array<{ ts: number; start: boolean }>;
  sessions: RawSession[];
  fileType: number | null;
  serial: number | null;
  created: number | null;
}

const ms = (fitS: number) => (fitS + FIT_EPOCH_S) * 1000;

function readMessages(bytes: Uint8Array): Raw | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raw: Raw = { records: [], timer: [], sessions: [], fileType: null, serial: null, created: null };
  let offset = 0;
  let any = false;
  // A file can hold several FIT files back to back (chained); read them all.
  while (offset + 12 <= bytes.length) {
    const headerSize = bytes[offset];
    if (headerSize < 12 || offset + headerSize > bytes.length) break;
    if (String.fromCharCode(bytes[offset + 8], bytes[offset + 9], bytes[offset + 10], bytes[offset + 11]) !== '.FIT') break;
    const dataSize = view.getUint32(offset + 4, true);
    let p = offset + headerSize;
    const end = Math.min(bytes.length, p + dataSize);
    any = true;
    const defs = new Map<number, Def>();
    let lastTs = 0;
    try {
      while (p < end) {
        const h = bytes[p++];
        if ((h & 0x80) === 0 && (h & 0x40) !== 0) {
          // Definition message
          const local = h & 0x0f;
          const little = bytes[p + 1] === 0;
          const global = little ? view.getUint16(p + 2, true) : view.getUint16(p + 2, false);
          const n = bytes[p + 4];
          p += 5;
          const fields: FieldDef[] = [];
          for (let i = 0; i < n; i++, p += 3) fields.push({ num: bytes[p], size: bytes[p + 1], base: bytes[p + 2] });
          let devSize = 0;
          if (h & 0x20) {
            const nd = bytes[p++];
            for (let i = 0; i < nd; i++, p += 3) devSize += bytes[p + 1];
          }
          defs.set(local, { global, little, fields, devSize });
          continue;
        }
        let local: number;
        let ts: number | null = null;
        if (h & 0x80) {
          // Compressed timestamp header: a 5-bit offset from the last full timestamp.
          local = (h >> 5) & 0x03;
          const off = h & 0x1f;
          lastTs = lastTs + ((off - (lastTs & 0x1f)) & 0x1f);
          ts = lastTs;
        } else {
          local = h & 0x0f;
        }
        const def = defs.get(local);
        if (!def) return raw.records.length || raw.sessions.length ? raw : null; // can't know the size: stop here
        const f: Fields = new Map();
        for (const fd of def.fields) {
          if (p + fd.size > end) throw new Error('truncated');
          f.set(fd.num, readValue(view, p, fd, def.little));
          p += fd.size;
        }
        p += def.devSize;
        const own = f.get(253);
        if (own != null) {
          lastTs = own;
          ts = own;
        }
        take(raw, def.global, f, ts);
      }
    } catch {
      // A watch that ran out of battery leaves a cut-off file. Keep what was read.
    }
    offset = offset + headerSize + dataSize + 2;
  }
  return any ? raw : null;
}

function take(raw: Raw, global: number, f: Fields, ts: number | null) {
  switch (global) {
    case MSG.fileId:
      raw.fileType = f.get(0) ?? null;
      raw.serial = f.get(3) ?? null;
      raw.created = f.get(4) ?? null;
      return;
    case MSG.record: {
      const la = f.get(0);
      const lo = f.get(1);
      if (ts == null || la == null || lo == null) return;
      const enh = f.get(78);
      const alt = enh != null ? enh / 5 - 500 : f.get(2) != null ? (f.get(2) as number) / 5 - 500 : null;
      const dist = f.get(5);
      raw.records.push({ ts: ms(ts), lat: la * SEMI, lon: lo * SEMI, alt, dist: dist != null ? dist / 100 : null });
      return;
    }
    case MSG.event: {
      // event 0 = timer; type 0 = start, 1 = stop, 4 = stop all
      if (ts == null || f.get(0) !== 0) return;
      const t = f.get(1);
      if (t === 0) raw.timer.push({ ts: ms(ts), start: true });
      else if (t === 1 || t === 4) raw.timer.push({ ts: ms(ts), start: false });
      return;
    }
    case MSG.session: {
      const start = f.get(2);
      const elapsed = f.get(7);
      raw.sessions.push({
        start: start != null ? ms(start) : null,
        end: ts != null ? ms(ts) : start != null && elapsed != null ? ms(start) + elapsed : null,
        elapsedS: elapsed != null ? elapsed / 1000 : null,
        timerS: f.get(8) != null ? (f.get(8) as number) / 1000 : null,
        distanceM: f.get(9) != null ? (f.get(9) as number) / 100 : null,
        ascentM: f.get(22) ?? null,
        sport: f.get(5) ?? null,
      });
      return;
    }
  }
}

/** Split records into pieces at timer stops, so pauses on the watch stay pauses here. */
function segment(records: TrackPoint[], timer: Raw['timer']): TrackPoint[][] {
  const stops = timer.filter((e) => !e.start).map((e) => e.ts);
  const out: TrackPoint[][] = [];
  let cur: TrackPoint[] = [];
  let si = 0;
  for (const r of records) {
    let cut = false;
    while (si < stops.length && stops[si] < r.ts) {
      si++;
      cut = true;
    }
    if (cut && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push({ ts: r.ts, lat: r.lat, lon: r.lon, alt: r.alt });
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Every run in a FIT file. A multisport file gives one activity per session; only the running ones come in. */
export function parseFit(bytes: Uint8Array): ParseResult {
  const out: ParseResult = { runs: [], skipped: [] };
  const raw = readMessages(bytes);
  if (!raw) {
    out.skipped.push('unreadable');
    return out;
  }
  // Courses (6), workouts (5), settings: not activities.
  if (raw.fileType != null && raw.fileType !== 4) {
    out.skipped.push('not-a-run');
    return out;
  }
  const records = raw.records.sort((a, b) => a.ts - b.ts);
  const sessions: RawSession[] = raw.sessions.length
    ? raw.sessions
    : [{ start: null, end: null, elapsedS: null, timerS: null, distanceM: null, ascentM: null, sport: null }];
  sessions.forEach((s, i) => {
    if (s.sport != null && !RUN_SPORTS.has(s.sport)) {
      out.skipped.push('not-a-run');
      return;
    }
    const lo = s.start ?? -Infinity;
    const hi = s.end ?? Infinity;
    const mine = records.filter((r) => r.ts >= lo && r.ts <= hi);
    const segments = segment(mine, raw.timer);
    if (!segments.length && (s.distanceM == null || s.timerS == null || s.start == null)) {
      out.skipped.push('too-short');
      return;
    }
    const lastDist = [...mine].reverse().find((r) => r.dist != null)?.dist ?? null;
    out.runs.push({
      segments,
      startedAt: s.start,
      endedAt: s.end,
      distanceM: s.distanceM ?? lastDist,
      movingS: s.timerS,
      elevationGainM: s.ascentM,
      sport: s.sport != null ? SPORT_NAMES[s.sport] ?? String(s.sport) : null,
      name: null,
      externalId: raw.serial != null && raw.created != null ? `fit:${raw.serial}:${raw.created}:${i}` : null,
    });
  });
  return out;
}

// ---- Writing ---------------------------------------------------------------

class Bytes {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  length = 0;
  private room(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  uint8(v: number) {
    this.u8(v);
  }
  u8(v: number) {
    this.room(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
  }
  u16(v: number) {
    this.room(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }
  u32(v: number) {
    this.room(4);
    this.view.setUint32(this.length, v >>> 0, true);
    this.length += 4;
  }
  i32(v: number) {
    this.room(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

type Kind = 'u8' | 'uint8' | 'u16' | 'u32' | 'i32';
// u8 is FIT's enum; uint8 a plain number (heart rate).
const BASE: Record<Kind, [number, number]> = { u8: [1, 0x00], uint8: [1, 0x02], u16: [2, 0x84], u32: [4, 0x86], i32: [4, 0x85] };

export interface FitExportRun {
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationS: number; // moving time
  elevationGainM: number;
  points: Array<{ ts: number; lat: number; lon: number; alt: number | null }>;
  heart?: HeartSample[]; // sorted; from a watch or strap
}

const toFit = (msTs: number) => Math.max(0, Math.round(msTs / 1000) - FIT_EPOCH_S);

/**
 * One run as a FIT activity file: file_id, timer start, a record per point
 * (position, height, distance so far, heart rate if there is any), timer stop, one lap, one session and
 * the activity. Garmin Connect, Strava, Runalyze and intervals.icu read it.
 */
export function writeFit(run: FitExportRun): Uint8Array {
  const b = new Bytes();
  const defined = new Set<number>();
  const msg = (local: number, global: number, fields: Array<[number, Kind, number]>) => {
    if (!defined.has(local)) {
      b.u8(0x40 | local);
      b.u8(0);
      b.u8(0); // little-endian
      b.u16(global);
      b.u8(fields.length);
      for (const [num, kind] of fields) {
        b.u8(num);
        b.u8(BASE[kind][0]);
        b.u8(BASE[kind][1]);
      }
      defined.add(local);
    }
    b.u8(local);
    for (const [, kind, v] of fields) b[kind](v);
  };
  const start = toFit(run.startedAt);
  const end = toFit(run.endedAt);
  const elapsedMs = Math.max(0, (end - start) * 1000);
  const timerMs = Math.round(run.durationS * 1000);
  const dist = Math.round(run.distanceM * 100);
  const ascent = Math.min(0xfffe, Math.round(run.elevationGainM));

  // file_id: activity, made by "development" (255), serial from the start time.
  msg(0, MSG.fileId, [
    [0, 'u8', 4],
    [1, 'u16', 255],
    [2, 'u16', 0],
    [3, 'u32', start || 1],
    [4, 'u32', start],
  ]);
  msg(1, MSG.event, [
    [253, 'u32', start],
    [0, 'u8', 0],
    [1, 'u8', 0],
  ]);
  const withHeart = !!run.heart?.length;
  const hs = withHeart ? heartSummary(run.heart!) : null;
  let cum = 0;
  let prev: { lat: number; lon: number } | null = null;
  for (const p of run.points) {
    if (prev) cum += haversineM(prev, p);
    prev = p;
    msg(2, MSG.record, [
      [253, 'u32', toFit(p.ts)],
      [0, 'i32', Math.round(p.lat / SEMI)],
      [1, 'i32', Math.round(p.lon / SEMI)],
      [78, 'u32', p.alt != null && Number.isFinite(p.alt) ? Math.round((p.alt + 500) * 5) : 0xffffffff],
      [5, 'u32', Math.round(cum * 100)],
      ...(withHeart ? [[3, 'uint8', heartAt(run.heart!, p.ts) ?? 0xff] as [number, Kind, number]] : []),
    ]);
  }
  msg(1, MSG.event, [
    [253, 'u32', end],
    [0, 'u8', 0],
    [1, 'u8', 4],
  ]);
  msg(3, MSG.lap, [
    [253, 'u32', end],
    [254, 'u16', 0],
    [2, 'u32', start],
    [7, 'u32', elapsedMs],
    [8, 'u32', timerMs],
    [9, 'u32', dist],
    [0, 'u8', 9],
    [1, 'u8', 1],
    [25, 'u8', 1],
  ]);
  msg(4, MSG.session, [
    [253, 'u32', end],
    [254, 'u16', 0],
    [2, 'u32', start],
    [7, 'u32', elapsedMs],
    [8, 'u32', timerMs],
    [9, 'u32', dist],
    [22, 'u16', ascent],
    ...(hs ? ([[16, 'uint8', hs.avg], [17, 'uint8', hs.max]] as Array<[number, Kind, number]>) : []),
    [5, 'u8', 1],
    [6, 'u8', 0],
    [0, 'u8', 8],
    [1, 'u8', 1],
    [25, 'u16', 0],
    [26, 'u16', 1],
  ]);
  const tzOffsetS = -new Date(run.startedAt).getTimezoneOffset() * 60;
  msg(5, MSG.activity, [
    [253, 'u32', end],
    [0, 'u32', timerMs],
    [1, 'u16', 1],
    [2, 'u8', 0],
    [3, 'u8', 26],
    [4, 'u8', 1],
    [5, 'u32', end + tzOffsetS],
  ]);

  const data = b.done();
  const out = new Uint8Array(14 + data.length + 2);
  const v = new DataView(out.buffer);
  out[0] = 14;
  out[1] = 0x10; // protocol 1.0: no developer fields here
  v.setUint16(2, 2132, true); // profile 21.32
  v.setUint32(4, data.length, true);
  out.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  v.setUint16(12, fitCrc(out, 0, 12), true);
  out.set(data, 14);
  v.setUint16(14 + data.length, fitCrc(out, 0, 14 + data.length), true);
  return out;
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
