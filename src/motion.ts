import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSettings } from './settings';

/** The phone's own "reduce motion" / "remove animations" setting, kept live. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * Whether background footage should hold still: the Still backgrounds switch,
 * the phone's reduce-motion setting, or battery saver. Any one is enough.
 */
export function useStillFootage(): boolean {
  const { settings } = useSettings();
  const reduce = useReduceMotion();
  return reduce || settings.stillBackground || settings.batteryMode === 'saver';
}
