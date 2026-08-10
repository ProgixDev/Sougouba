import { LogBox } from 'react-native';

/**
 * Side-effect module — import it FIRST in the root layout.
 *
 * LogBox only filters warnings raised after `ignoreLogs` runs, and both entries
 * below fire during dependency import, so registering them inside a component
 * body (or even later in the import list) is too late to catch them.
 *
 * Both are third-party noise with nothing actionable in this codebase, and the
 * LogBox toast sits on top of the UI — it covers the primary CTA on the
 * onboarding and auth screens, which makes the app hard to use in dev.
 *
 *  - SafeAreaView: RN 0.86 warns from a getter on its own module namespace, so
 *    any dependency that enumerates `react-native`'s exports trips it. Every
 *    SafeAreaView in this app comes from react-native-safe-area-context.
 *  - onAnimatedValueUpdate: fired when a native-driven Animated node is torn
 *    down before its JS listener detaches — a known Moti/Animated interop
 *    artifact, not a leak on our side.
 *
 * Keep this list short and specific. Anything originating in our own code
 * belongs fixed, not silenced.
 */
LogBox.ignoreLogs([
  'SafeAreaView has been deprecated',
  'Sending `onAnimatedValueUpdate` with no listeners registered',
]);

