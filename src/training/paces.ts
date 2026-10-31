// Training paces from one recent race, after Daniels & Gilbert (Oxygen Power,
// 1979) as used in Daniels' Running Formula. Pure maths, no imports.
//
// VO2 cost of running at v metres/min:   -4.60 + 0.182258 v + 0.000104 v²
// Share of VO2max a runner can hold for t minutes:
//   0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t)
// VDOT is the VO2max that makes the two agree for the race you ran.

export interface Paces {
  vdot: number;
  easy: [number, number]; // s/km, slow to fast
  marathon: number;
  threshold: number;
  interval: number;
  reps: number;
  predicted: { '5k': number; '10k': number; half: number; marathon: number }; // seconds
}

function cost(vMPerMin: number): number {
  return -4.6 + 0.182258 * vMPerMin + 0.000104 * vMPerMin * vMPerMin;
}

function share(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
}

export function vdotFromRace(distanceKm: number, timeS: number): number {
  const tMin = timeS / 60;
  const v = (distanceKm * 1000) / tMin;
  return cost(v) / share(tMin);
}

/** Velocity (m/min) that costs the given share of VDOT. */
function velocityAt(vdot: number, fraction: number): number {
  const c = 4.6 + fraction * vdot;
  return (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * c)) / (2 * 0.000104);
}

function sPerKm(vMPerMin: number): number {
  return Math.round((1000 / vMPerMin) * 60);
}

/** Race time at this VDOT for a distance, by bisection on time. */
export function predictS(vdot: number, distanceKm: number): number {
  let lo = 60;
  let hi = 6 * 3600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(distanceKm, mid) > vdot) lo = mid; // ran faster than vdot allows: slow down
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * Daniels' zones as shares of VDOT: E 60–67%, M ≈ 82%, T ≈ 88%, I ≈ 97.5%,
 * R ≈ 105%. For VDOT 50 these land on the published table (T 4:15, I 3:55, M 4:31 per km).
 */
export function pacesFor(vdot: number): Paces {
  return {
    vdot: Math.round(vdot * 10) / 10,
    easy: [sPerKm(velocityAt(vdot, 0.6)), sPerKm(velocityAt(vdot, 0.67))],
    marathon: sPerKm(velocityAt(vdot, 0.82)),
    threshold: sPerKm(velocityAt(vdot, 0.88)),
    interval: sPerKm(velocityAt(vdot, 0.975)),
    reps: sPerKm(velocityAt(vdot, 1.05)),
    predicted: { '5k': predictS(vdot, 5), '10k': predictS(vdot, 10), half: predictS(vdot, 21.0975), marathon: predictS(vdot, 42.195) },
  };
}

export function pacesFromRace(distanceKm: number, timeS: number): Paces {
  return pacesFor(vdotFromRace(distanceKm, timeS));
}

export function formatSPerKm(s: number, km = true): string {
  const per = km ? s : s * 1.609344;
  // Rounded to the whole second first, so 5:59.6 reads 6:00, never 5:60.
  const t = Math.round(per);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function formatRaceTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
