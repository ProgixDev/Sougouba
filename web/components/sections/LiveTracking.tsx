'use client';
import { useEffect, useRef, useState } from 'react';
import { Bike, MapPin, Store } from 'lucide-react';
import { Reveal, Text } from '@/components/ui';
import { tracking } from '@/lib/content';
import {
  DROPOFF, PICKUP, STREETS, etaMinutes, positionAlong, splitPath, toPath,
} from '@/lib/route';

/**
 * The section that proves the product is real.
 *
 * Scroll-scrubbed, not autoplaying: the visitor drives the delivery, which is
 * both more engaging and honest about what the app does — you watch a courier
 * move, you do not watch a video of one.
 */
export function LiveTracking() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Reduced motion still gets a finished picture: the run is part-done, so
      // the split, the puck and the ETA are all meaningful rather than at zero.
      setT(0.55);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // 0 when the sticky panel locks, 1 when the tall wrapper is scrolled out.
        const span = r.height - window.innerHeight;
        const p = span <= 0 ? 0 : (-r.top) / span;
        setT(Math.max(0, Math.min(1, p)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const { driven, ahead } = splitPath(t);
  const [cx, cy] = positionAlong(t);
  const eta = etaMinutes(t);
  const moving = t > 0.001 && t < 0.999;

  return (
    <section id="suivi" ref={ref} className="relative h-[240vh]">
      <div className="sticky top-0 flex min-h-dvh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-content items-center gap-10 px-5 py-16 md:px-8 lg:grid-cols-[0.85fr_1fr]">
          <div>
            <Reveal>
              <Text variant="label" tone="muted" as="p">{tracking.eyebrow}</Text>
              <Text variant="title" as="h2" className="mt-3 max-w-[15ch]">{tracking.title}</Text>
              <p className="mt-5 max-w-[46ch] font-sans text-[1.0625rem] leading-[1.65] text-muted-foreground">
                {tracking.body}
              </p>
              <p className="mt-6 font-sans text-[0.8125rem] uppercase tracking-[0.08em] text-muted-foreground">
                {tracking.hint}
              </p>
            </Reveal>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-card bg-card shadow-card">
              <svg viewBox="0 0 466 340" className="block w-full" role="img" aria-label={tracking.title}>
                {/* Grid: decorative, carries no data. */}
                <g stroke="currentColor" className="text-forest-950/[0.07] dark:text-forest-100/[0.07]" strokeWidth="1">
                  {STREETS.h.map((y) => <line key={`h${y}`} x1="8" y1={y} x2="458" y2={y} />)}
                  {STREETS.v.map((x) => <line key={`v${x}`} x1={x} y1="20" x2={x} y2="320" />)}
                </g>

                {/* Casing first: a 4pt forest line vanishes over a dark park. */}
                <path d={toPath([...driven, ...ahead.slice(1)])} fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                <path d={toPath(driven)} fill="none" className="stroke-neutral-300" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={toPath(ahead)} fill="none" className="stroke-primary" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

                <Pin x={PICKUP[0]} y={PICKUP[1]} tone="#246B47" />
                <Pin x={DROPOFF[0]} y={DROPOFF[1]} tone="#BF5122" />

                {/* Sonar only while moving: a pulse on a stationary courier claims
                    movement that is not happening. */}
                {moving && (
                  <circle cx={cx} cy={cy} r="14" fill="#D89A1E" className="sonar" />
                )}
                <circle cx={cx} cy={cy} r="11" fill="#FFFFFF" />
                <circle cx={cx} cy={cy} r="9" fill="#D89A1E" />
              </svg>
            </div>

            {/* Glass card over the map — the one other place blur is used, because
                the map moves underneath it. */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-card/78 p-3.5 backdrop-blur-xl sm:right-auto sm:min-w-[300px]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mustard-100 text-mustard-800 dark:bg-mustard-950 dark:text-mustard-200">
                <Bike size={19} strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate font-sans text-[0.9375rem] font-semibold">{tracking.courier}</p>
                <p className="truncate font-sans text-[0.8125rem] text-muted-foreground">{tracking.vehicle}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="font-sans text-[0.6875rem] uppercase tracking-[0.07em] text-muted-foreground">
                  {tracking.etaLabel}
                </p>
                <p className="tabular font-display text-[1.25rem] font-bold leading-none opsz-20">
                  {eta} min
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pin({ x, y, tone }: { x: number; y: number; tone: string }) {
  const Icon = tone === '#246B47' ? Store : MapPin;
  return (
    <g transform={`translate(${x - 13} ${y - 13})`}>
      <circle cx="13" cy="13" r="13" fill="#FFFFFF" />
      <circle cx="13" cy="13" r="11" fill={tone} />
      <g transform="translate(6.5 6.5)" color="#FFFFFF">
        <Icon size={13} strokeWidth={2.2} aria-hidden />
      </g>
    </g>
  );
}
