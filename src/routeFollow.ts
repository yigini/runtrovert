// Following a route: how far you are from the line, and when that is worth a
// buzz. Pure, so the rules are tested in Node (npm run test:routes).
//
// The rules, in order of how much they matter:
// - Never buzz before you've been on the route: running to its start is not "off".
// - Off means clearly off: past a distance that grows with poor GPS, for three
//   fixes and ten seconds in a row. A bad fix under a bridge is not a turn.
// - Back means clearly back, then one short tap.
// - While you stay off: a reminder after a minute, then two minutes. Then quiet:
//   you've chosen your own way, and that's allowed.

export interface Pt {
  lat: number;
  lon: number;
}

const R = 6371000;
const RAD = Math.PI / 180;

/** Metres between two points (haversine). */
export function metres(a: Pt, b: Pt): number {
  const h = Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lon - a.lon) * RAD) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of a path in metres. */
export function pathLength(path: Pt[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += metres(path[i - 1], path[i]);
  return d;
}

/** Metres from p to the segment a–b, on a flat patch of earth around p (fine at running scale). */
function toSegment(p: Pt, a: Pt, b: Pt, kx: number): number {
  const ax = (a.lon - p.lon) * kx;
  const ay = (a.lat - p.lat) * R * RAD;
  const bx = (b.lon - p.lon) * kx;
  const by = (b.lat - p.lat) * R * RAD;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

/** The shortest distance from p to the path, and which segment it is nearest. */
export function nearest(p: Pt, path: Pt[], from = 0, to = path.length - 1): { m: number; i: number } {
  if (path.length === 1) return { m: metres(p, path[0]), i: 0 };
  const kx = R * RAD * Math.cos(p.lat * RAD);
  let best = Infinity;
  let at = 0;
  for (let i = Math.max(0, from); i < Math.min(path.length - 1, to); i++) {
    const d = toSegment(p, path[i], path[i + 1], kx);
    if (d < best) (best = d), (at = i);
  }
  return { m: best, i: at };
}

/** Fewer points, same shape (Douglas–Peucker), so a long route stays light to store and to check against. */
export function simplify(path: Pt[], toleranceM = 4): Pt[] {
  if (path.length < 3) return path.slice();
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let farD = toleranceM;
    const kx = R * RAD * Math.cos(path[a].lat * RAD);
    for (let i = a + 1; i < b; i++) {
      const d = toSegment(path[i], path[a], path[b], kx);
      if (d > farD) (farD = d), (far = i);
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

export type RouteEvent = 'off' | 'remind' | 'back' | null;

const ON_M = 30; // within this, you're on it (and joined it, the first time)
const OFF_MIN_M = 45; // past this, with good GPS, you may be off
const OFF_MAX_M = 90; // the threshold never grows past this, however poor the GPS
const OFF_FIXES = 3;
const OFF_MS = 10_000;
const BACK_FIXES = 2;
const REMINDERS_MS = [60_000, 120_000];

export class RouteWatch {
  private path: Pt[];
  private joined = false;
  private off = false;
  private farCount = 0;
  private farSince = 0;
  private nearCount = 0;
  private offAt = 0;
  private reminded = 0;
  /** How far off you are now, while off; null on the route. */
  offByM: number | null = null;

  constructor(path: Pt[]) {
    this.path = path;
  }

  /** Feed a position. Returns what the runner should feel, if anything. */
  push(p: Pt, accM: number | null, ts: number): RouteEvent {
    if (this.path.length < 2) return null;
    const d = nearest(p, this.path).m;
    const offM = Math.min(OFF_MAX_M, Math.max(OFF_MIN_M, (accM ?? 15) * 2));
    if (!this.joined) {
      if (d <= ON_M) this.joined = true;
      return null;
    }
    if (!this.off) {
      if (d > offM) {
        if (this.farCount++ === 0) this.farSince = ts;
        if (this.farCount >= OFF_FIXES && ts - this.farSince >= OFF_MS) {
          this.off = true;
          this.offAt = ts;
          this.reminded = 0;
          this.nearCount = 0;
          this.offByM = Math.round(d);
          return 'off';
        }
      } else this.farCount = 0;
      return null;
    }
    this.offByM = Math.round(d);
    if (d <= ON_M) {
      if (++this.nearCount >= BACK_FIXES) {
        this.off = false;
        this.farCount = 0;
        this.offByM = null;
        return 'back';
      }
      return null;
    }
    this.nearCount = 0;
    if (this.reminded < REMINDERS_MS.length && ts - this.offAt >= REMINDERS_MS.slice(0, this.reminded + 1).reduce((a, b) => a + b, 0)) {
      this.reminded++;
      return 'remind';
    }
    return null;
  }

  get isOff(): boolean {
    return this.off;
  }
}
