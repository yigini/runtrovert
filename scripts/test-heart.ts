// npm run test:heart — heart rate from a watch, and the phone <-> watch messages.
import assert from 'node:assert/strict';
import { cleanHeart, heartAt, heartSummary, keepReading, STRAP_WINS_MS } from '../src/heart.ts';
import { liveJson, OPEN_FOR_MS, parseCommand, parseHeart, parseHello, shouldSend, splitJson } from '../src/wearProtocol.ts';

const t0 = Date.UTC(2026, 9, 30, 7, 0, 0);

// Summary: averaged over time, gaps skipped, too little says nothing.
{
  const steady = Array.from({ length: 121 }, (_, i) => ({ ts: t0 + i * 1000, bpm: 150 }));
  assert.deepEqual(heartSummary(steady), { avg: 150, max: 150, samples: 121 });
  assert.equal(heartSummary(steady.slice(0, 30)), null, 'half a minute is too little');
  assert.equal(heartSummary([]), null);

  // A watch that reads every second at 120 and every 10 s at 160 still averages by time.
  const mixed = [
    ...Array.from({ length: 61 }, (_, i) => ({ ts: t0 + i * 1000, bpm: 120 })),
    ...Array.from({ length: 6 }, (_, i) => ({ ts: t0 + 70_000 + i * 10_000, bpm: 160 })),
  ];
  const m = heartSummary(mixed)!;
  assert.ok(m.avg > 135 && m.avg < 145, `time-weighted average, got ${m.avg}`);
  assert.equal(m.max, 160);

  // Five minutes off the wrist don't count as five minutes at the last reading.
  const gap = [...steady, { ts: t0 + 420_000, bpm: 100 }, { ts: t0 + 421_000, bpm: 100 }];
  assert.ok(heartSummary(gap)!.avg >= 149, 'a long gap is skipped');
}

// Cleaning: inside the run, sorted, no repeats, nothing impossible.
{
  const raw = [
    { ts: t0 + 2000, bpm: 140 },
    { ts: t0 - 5000, bpm: 90 }, // before the start
    { ts: t0 + 1000, bpm: 138 },
    { ts: t0 + 1000, bpm: 139 }, // same moment twice
    { ts: t0 + 3000, bpm: 300 }, // not a heart
    { ts: t0 + 9_000_000, bpm: 120 }, // after the end
  ];
  const c = cleanHeart(raw, t0, t0 + 3_600_000);
  assert.deepEqual(c.map((s) => s.ts), [t0 + 1000, t0 + 2000]);
  assert.equal(cleanHeart(raw, t0, null).length, 3, 'no end yet: everything after the start');
}

// Messages.
{
  assert.equal(parseCommand('{"cmd":"pause"}'), 'pause');
  assert.equal(parseCommand('{"cmd":"delete"}'), null, 'only the four buttons');
  assert.equal(parseCommand('not json'), null);
  assert.equal(parseHello('{"open":true}'), true);
  assert.equal(parseHello('{}'), null);
  assert.deepEqual(parseHeart('{"s":[[1,140],[2,"x"],[3,20],[4,151.6]]}'), [[1, 140], [4, 152]]);
  assert.deepEqual(parseHeart('{"s":5}'), []);
  const live = JSON.parse(liveJson({ status: 'running', distanceM: 1234.5678, durationS: 300.04, unitsKm: true }));
  assert.deepEqual(live, { status: 'running', distanceM: 1234.6, durationS: 300, unitsKm: true });
  assert.equal(JSON.parse(liveJson({ status: 'idle', distanceM: 0, durationS: 0, unitsKm: false }, true)).needsOpen, true);
  assert.deepEqual(JSON.parse(splitJson(3, 342, 3000, 1030, true)), { index: 3, durationS: 342, distanceM: 3000, totalS: 1030, unitsKm: true });
}

// How often the phone talks: every second while the watch looks, otherwise only on a change.
{
  const now = t0;
  const open = now + OPEN_FOR_MS;
  assert.equal(shouldSend(now, null, 'running', 0), true, 'first word always goes');
  assert.equal(shouldSend(now, { at: now - 500, status: 'running' }, 'running', open), false);
  assert.equal(shouldSend(now, { at: now - 1000, status: 'running' }, 'running', open), true);
  assert.equal(shouldSend(now, { at: now - 60_000, status: 'running' }, 'running', 0), false, 'watch closed: no ticking');
  assert.equal(shouldSend(now, { at: now - 10, status: 'running' }, 'paused', 0), true, 'a change goes straight away');
}

console.log('heart ok');

// Two sources: a strap that spoke lately wins; the watch fills in when it hasn't.
{
  assert.equal(keepReading('strap', t0, t0), true);
  assert.equal(keepReading('watch', t0, 0), true, 'no strap: the watch counts');
  assert.equal(keepReading('watch', t0 + 5_000, t0), false, 'strap just spoke: the watch is dropped');
  assert.equal(keepReading('watch', t0 + STRAP_WINS_MS + 1, t0), true, 'strap gone quiet: the watch takes over');
}

// Heart rate onto route points, for the GPX and FIT exports.
{
  const s = [{ ts: t0, bpm: 120 }, { ts: t0 + 5_000, bpm: 130 }, { ts: t0 + 60_000, bpm: 150 }];
  assert.equal(heartAt(s, t0 + 2_000), 120);
  assert.equal(heartAt(s, t0 + 4_000), 130);
  assert.equal(heartAt(s, t0 + 30_000), null, 'nothing within 10 s');
  assert.equal(heartAt(s, t0 + 70_000), 150);
  assert.equal(heartAt([], t0), null);
}
console.log('heart: two sources, export ok');

