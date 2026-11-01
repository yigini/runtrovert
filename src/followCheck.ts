import { Alert } from 'react-native';
import { ui } from './i18n/ui';
import { NEAR_ROUTE_M, roughDistance, type Pt } from './routeFollow';
import { howFarFromRoute } from './routeNear';

// Every way into following a route (a place's Run this again, a saved route,
// the Run tab's place) asks the same question first: are you anywhere near
// it? Near: go. Far, or the phone can't tell: say so and let the runner pick.
// Run detail asks the same, inline, with its own Keep it for later.

/** Resolves true to go ahead and follow, false to stay where you are. */
export async function okToFollow(path: Pt[], name: string, km: boolean): Promise<boolean> {
  const m = await howFarFromRoute(path);
  if (m != null && m <= NEAR_ROUTE_M) return true;
  return new Promise((done) =>
    Alert.alert(name, m == null ? ui().routes.noFix : ui().routes.farAway(roughDistance(m, km)), [
      { text: ui().everything.notNow, style: 'cancel', onPress: () => done(false) },
      { text: ui().routes.followAnyway, onPress: () => done(true) },
    ], { cancelable: true, onDismiss: () => done(false) }),
  );
}
