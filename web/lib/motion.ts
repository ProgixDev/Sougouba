import type { Transition, Variants } from 'motion/react';

/**
 * The app's motion vocabulary, ported verbatim.
 *
 * These are not new numbers. `spring` is the transition every sheet, modal and
 * card in the Expo app uses; `stagger`/`staggerCap` are Reveal.tsx's STEP_MS and
 * MAX_STAGGER_MS; `kenBurns` is OnboardingSlide.tsx's drift. Reusing them is what
 * makes the site feel like the same hand made both — inventing a second
 * vocabulary is how two surfaces of one product start to feel unrelated.
 */
export const spring: Transition = { type: 'spring', damping: 20, stiffness: 190, mass: 0.9 };

/** Overshoots just enough to feel physical; damping keeps it from wobbling. */
export const springSnap: Transition = { type: 'spring', damping: 13, stiffness: 220, mass: 0.6 };

/** Entering: ease-out. Never linear for UI. */
export const reveal: Transition = { duration: 0.38, ease: [0.22, 1, 0.36, 1] };

/** Exits run at ~65% of the enter, so dismissal feels responsive. */
export const exit: Transition = { duration: 0.25, ease: [0.4, 0, 1, 1] };

export const backdrop: Transition = { duration: 0.18, ease: 'linear' };

export const STAGGER = 0.055;
/** Beyond this the list is scrolled past anyway, and waiting reads as jank. */
export const STAGGER_CAP = 0.33;

/** Per-triangle delay for the woven band's weave-in. */
export const BAND_STAGGER = 0.024;
export const BAND_CAP = 0.4;

export const kenBurns = { duration: 16, zoom: 0.14, driftPx: 18 } as const;
export const sonar = { duration: 2 } as const;

export function staggerDelay(index: number, step = STAGGER, cap = STAGGER_CAP) {
  return Math.min(index * step, cap);
}

/** The app's only entrance: up 18px, fade in. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...reveal, delay: staggerDelay(i) } }),
};

/** Fires once, at 25% visibility, and never re-fires on scroll-up. */
export const viewportOnce = { once: true, amount: 0.25 } as const;
