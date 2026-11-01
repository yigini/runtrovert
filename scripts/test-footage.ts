// Home's rotating background: always fits the sky, never repeats the last loop, surprises now and then by day.
import { rotateFootage, SURPRISE, type Footage, type Scene } from '../src/footage.ts';

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error('FAIL', what);
  }
};

// Seeded random so the run is repeatable.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const scenes: Scene[] = ['storm', 'snow', 'rain', 'fog', 'night', 'dusk', 'cold', 'heat', 'wind', 'clear', 'cloud'];
for (const scene of scenes) {
  let last: Footage | null = null;
  const seen = new Set<Footage>();
  let surprises = 0;
  for (let i = 0; i < 600; i++) {
    const f = rotateFootage(scene, last, rand);
    check(f !== last, `${scene}: repeated ${f}`);
    if (SURPRISE.includes(f)) surprises++;
    seen.add(f);
    last = f;
  }
  check(seen.size >= 2, `${scene}: only ${seen.size} loop(s) shown`);
  if (scene === 'night' || scene === 'storm' || scene === 'snow' || scene === 'rain') {
    // Surprise loops may still belong to the scene's own pool; none of these pools hold one.
    check(surprises === 0, `${scene}: a sunny surprise under a ${scene} sky`);
  } else {
    check(surprises > 30, `${scene}: surprises too rare (${surprises}/600)`);
  }
}

console.log(failures ? `footage: ${failures} failure(s)` : 'footage ok: rotates, never repeats, surprises by day');
process.exit(failures ? 1 : 0);
