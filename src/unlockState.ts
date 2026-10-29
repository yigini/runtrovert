import { useSyncExternalStore } from 'react';
import { loadValue, saveValue } from './db';
import { DEFAULT_UNLOCK, isUnlocked, setUnlockState, subscribeUnlock, unlockState, type UnlockState } from './unlock';

// The unlock's state on this phone, and the one way to open the Everything,
// once screen from anywhere (a lock row, the finish line, Settings).

const KEY = 'unlock';

/** Read the saved state once, at start. A purchase is also confirmed with the store in billing.ts. */
export async function loadUnlock(): Promise<void> {
  const saved = await loadValue<Partial<UnlockState>>(KEY).catch(() => null);
  setUnlockState({ ...DEFAULT_UNLOCK, ...(saved ?? {}) });
}

export function updateUnlock(patch: Partial<UnlockState>): void {
  const next = setUnlockState(patch);
  saveValue(KEY, next).catch(() => {});
}

/** Re-renders when the unlock changes, so a lock row disappears the moment it is bought. */
export function useUnlocked(): boolean {
  return useSyncExternalStore(subscribeUnlock, isUnlocked);
}

export function useUnlockState(): UnlockState {
  return useSyncExternalStore(subscribeUnlock, unlockState);
}

// ---- Opening the screen ----------------------------------------------------------

let open = false;
const openListeners = new Set<() => void>();

export function openUnlock(): void {
  open = true;
  for (const l of openListeners) l();
}

export function closeUnlock(): void {
  open = false;
  for (const l of openListeners) l();
}

export function useUnlockOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      openListeners.add(l);
      return () => {
        openListeners.delete(l);
      };
    },
    () => open,
  );
}
