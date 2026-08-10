import { useEventListener } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

const splashVideo = require('@/assets/video/splashscreen.mp4');

/**
 * How long the splash is allowed to hold the app before we move on regardless.
 *
 * This is a **failsafe, not the timing** — the redirect normally fires on the
 * video's `playToEnd`. It only matters if playback stalls or the decoder fails,
 * where the alternative is a shopper stuck on a frozen frame forever.
 *
 * The animation itself runs 8.2s. That is still long for something shown on
 * every cold start; to cut it short, lower this to ~3500 and the failsafe
 * becomes the timing.
 */
const MAX_SPLASH_MS = 11_000;

/** The video's own studio backdrop, so no edge can flash a different colour. */
const BACKDROP = '#D0D0D0';

/**
 * Animated splash: the brand film, then the one-time routing decision.
 *
 * The source (`splashLast.mov` in the repo root) is a 1920×1080 file whose
 * actual content is a 608×1080 portrait column pillarboxed in black —
 * `assets/video/splashscreen.mp4` is that column cropped out and the audio
 * track stripped (a launch screen must never
 * interrupt someone's music, and `muted` alone would still claim the audio
 * session). It is rendered `cover`: the backdrop is a graduated studio sweep
 * rather than a flat colour, so letterboxing it would leave a visible seam where
 * the bars meet the gradient. Cover trims ~9% off each side, which the centred
 * logo lockup clears comfortably.
 */
export default function SplashScreenSlot() {
  const decided = useRef(false);

  const player = useVideoPlayer(splashVideo, (instance) => {
    instance.muted = true;
    instance.loop = false;
    // Belt and braces alongside the stripped audio track: never duck or pause
    // whatever the shopper is already listening to.
    instance.audioMixingMode = 'mixWithOthers';
    instance.play();
  });

  // Read session state at decision time rather than render time, so anything
  // that mutated it while the film played is still respected.
  function decide() {
    if (decided.current) return;
    decided.current = true;

    const { user } = useSessionStore.getState();

    // Signed out always opens on onboarding, not straight at the auth form.
    if (!user) {
      router.replace(routes.onboarding);
    } else if (!user.role) {
      router.replace(routes.roleSelect);
    } else {
      router.replace(homeRouteForRole(user.role));
    }
  }

  useEventListener(player, 'playToEnd', decide);

  useEffect(() => {
    const timer = setTimeout(decide, MAX_SPLASH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: BACKDROP }]}>
      <VideoView
        player={player}
        style={styles.fill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
