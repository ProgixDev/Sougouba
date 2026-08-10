import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  useReducedMotion,
} from 'react-native-reanimated';

type From = 'bottom' | 'right' | 'fade';

export interface RevealProps {
  children: ReactNode;
  /** Position in its list — drives the stagger. */
  index?: number;
  from?: From;
  /** Extra delay before the stagger starts, for content below an already-animating block. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** Per-item stagger. Small enough to read as one gesture rather than a queue. */
const STEP_MS = 55;
/** Beyond this the list is scrolled past anyway, and waiting reads as jank, not choreography. */
const MAX_STAGGER_MS = 330;
const DURATION_MS = 380;

/**
 * Entrance animation for content arriving after a fetch or a screen change.
 *
 * Everything the shopper sees lands from the same direction with the same easing,
 * so a screen resolves as one movement instead of a set of independent effects.
 * The stagger is capped rather than linear: on a 24-card grid a plain
 * `index * step` would leave the last row arriving three seconds late.
 */
export function Reveal({ children, index = 0, from = 'bottom', delay = 0, style, className }: RevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <Animated.View style={style} className={className}>
        {children}
      </Animated.View>
    );
  }

  const offset = delay + Math.min(index * STEP_MS, MAX_STAGGER_MS);
  const entering =
    from === 'bottom'
      ? FadeInDown.duration(DURATION_MS).delay(offset).withInitialValues({
          transform: [{ translateY: 18 }],
        })
      : from === 'right'
        ? FadeInRight.duration(DURATION_MS).delay(offset)
        : FadeIn.duration(DURATION_MS).delay(offset);

  return (
    <Animated.View entering={entering} style={style} className={className}>
      {children}
    </Animated.View>
  );
}
