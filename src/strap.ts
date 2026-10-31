import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { loadValue, saveValue } from './db';
import { heartIn } from './heartIn';
import type { WatchStatus } from './wearProtocol';

/**
 * Heart rate from a Bluetooth strap, or from any watch that broadcasts it
 * (Garmin's "Broadcast heart rate", Polar, Coros, Suunto, Wahoo...). The
 * phone connects straight to the sensor (modules/runtrovert-heart) only while
 * a run is on, and the readings go into the run here, like the Wear OS app's.
 * Free: nothing here asks isUnlocked().
 */

export interface Strap {
  id: string; // the sensor's Bluetooth address
  name: string;
}

export type StrapState = 'off' | 'connecting' | 'connected' | 'noHeart';

interface Native {
  isSupported(): boolean;
  isOn(): boolean;
  startScan(ms: number): boolean;
  stopScan(): void;
  connect(id: string): boolean;
  disconnect(): void;
  addListener(event: 'onFound', cb: (e: { id: string; name: string; rssi: number }) => void): { remove(): void };
  addListener(event: 'onHeart', cb: (e: { bpm: number; ts: number }) => void): { remove(): void };
  addListener(event: 'onState', cb: (e: { state: StrapState }) => void): { remove(): void };
}

// Missing on iPhone, in Expo Go and on web: then everything here does nothing.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('RuntrovertHeart') : null;

const KEY = 'heartStrap';
const FLUSH_MS = 5_000;

let strap: Strap | null = null;
let loaded = false;
let started = false;
let inRun = false;
let checking = false; // Settings is showing the live reading
let linkState: StrapState = 'off';
let lastBpm: { bpm: number; ts: number } | null = null;
let buffer: Array<[number, number]> = [];
let flushAt = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function flush() {
  if (!buffer.length) return;
  const out = buffer;
  buffer = [];
  flushAt = Date.now();
  heartIn('strap', out);
}

function start() {
  if (!native || started) return;
  started = true;
  native.addListener('onHeart', ({ bpm, ts }) => {
    lastBpm = { bpm, ts: Math.round(ts) };
    if (inRun) {
      buffer.push([lastBpm.ts, bpm]);
      // The first one straight away, so the guided session hears the strap at once; then every few seconds.
      if (Date.now() - flushAt >= FLUSH_MS) flush();
    }
    emit();
  });
  native.addListener('onState', ({ state }) => {
    linkState = state;
    if (state !== 'connected') lastBpm = null;
    emit();
  });
}

export function strapSupported(): boolean {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
}

async function ensureLoaded(): Promise<Strap | null> {
  if (!loaded) {
    strap = await loadValue<Strap>(KEY).catch(() => null);
    loaded = true;
    emit();
  }
  return strap;
}

/** Android 12+ asks for "Nearby devices"; older versions scan under the location permission the app already has. */
export async function askBluetooth(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (Number(Platform.Version) >= 31) {
      const r = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]);
      return Object.values(r).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    }
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

async function canConnect(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (Number(Platform.Version) < 31) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT).catch(() => false);
}

function linkWanted(): boolean {
  return !!strap && (inRun || checking);
}

async function relink() {
  if (!native) return;
  start();
  await ensureLoaded();
  if (linkWanted() && strap && (await canConnect())) {
    try {
      native.connect(strap.id);
    } catch {}
  } else {
    flush();
    try {
      native.disconnect();
    } catch {}
  }
}

/**
 * From the tracking tick: connect when a run starts, let go when it's over.
 * Cheap: only a change of run-or-not does anything.
 */
export function strapRun(status: WatchStatus): void {
  const on = status !== 'idle' && status !== 'halted';
  if (on === inRun) return;
  inRun = on;
  if (!on) flush();
  void relink();
}

/** Settings shows the live reading while it's open, so the runner can see the strap works before going out. */
export function strapCheck(on: boolean): void {
  if (checking === on) return;
  checking = on;
  void relink();
}

export async function saveStrap(s: Strap | null): Promise<void> {
  strap = s;
  loaded = true;
  await saveValue(KEY, s);
  emit();
  await relink();
}

/**
 * Looks for sensors for 12 s. Calls onFound for each new one; returns a stop
 * function. false when Bluetooth is off or the permission was refused.
 */
export async function scanStraps(onFound: (s: Strap) => void, onDone: () => void): Promise<(() => void) | 'off' | 'denied'> {
  if (!native) return 'off';
  if (!(await askBluetooth())) return 'denied';
  if (!native.isOn()) return 'off';
  const seen = new Set<string>();
  const sub = native.addListener('onFound', ({ id, name }) => {
    if (seen.has(id)) return;
    seen.add(id);
    onFound({ id, name: name || id });
  });
  const ms = 12_000;
  if (!native.startScan(ms)) {
    sub.remove();
    return 'off';
  }
  const timer = setTimeout(() => {
    sub.remove();
    onDone();
  }, ms);
  return () => {
    clearTimeout(timer);
    sub.remove();
    try {
      native.stopScan();
    } catch {}
  };
}

export interface StrapView {
  strap: Strap | null;
  state: StrapState;
  bpm: number | null;
}

function view(): StrapView {
  const fresh = lastBpm && Date.now() - lastBpm.ts < 10_000 ? lastBpm.bpm : null;
  return { strap, state: linkState, bpm: fresh };
}

/** The saved sensor, its link and its latest reading, for Settings. */
export function useStrap(): StrapView {
  const [v, setV] = useState<StrapView>(view);
  useEffect(() => {
    const l = () => setV(view());
    listeners.add(l);
    void ensureLoaded().then(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}
