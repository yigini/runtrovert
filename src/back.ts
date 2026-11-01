import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * The phone's back gesture, one place. Screens push a handler while they have
 * somewhere to go back to; the newest one answers first. App.tsx listens to
 * Android's BackHandler once and asks this stack before deciding anything
 * itself (switch to the Run tab, or leave on a second press).
 *
 * Our own stack rather than many BackHandler listeners because React mounts
 * children before parents: the order listeners were added would not match
 * what's on screen.
 */
type Handler = () => boolean;
const stack: Array<{ current: Handler }> = [];

export function handleBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].current()) return true;
  }
  return false;
}

/**
 * False inside a tab that stays mounted but is hidden (App.tsx keeps Your runs
 * and Train alive between visits). A hidden screen never answers the back gesture.
 */
export const ScreenActive = createContext(true);

/** Answer the back gesture with `handler` while `enabled` (and while its screen is on show). Return true when handled. */
export function useBack(handler: Handler, wanted = true): void {
  const enabled = useContext(ScreenActive) && wanted;
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const entry = { current: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}
