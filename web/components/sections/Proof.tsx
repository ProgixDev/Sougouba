'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { Badge, Reveal, Text } from '@/components/ui';
import { proof } from '@/lib/content';
import { useInView } from '@/components/ui/useInView';

/** useLayoutEffect warns when it runs during SSR; on the server there is nothing to lay out. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Counts once, on enter, then stops.
 *
 * The initial state is the REAL value, not zero. This strip is the page's
 * credibility, and with scripting off — or if the section is never scrolled into
 * view — a counter seeded at zero does not read as a missing animation, it reads
 * as "0 commerces, 0 produits", which is a false claim about the business.
 *
 * So the server renders the truth, and the client resets to zero in a layout
 * effect — before paint, so there is no visible flash from 10 down to 0 — and only
 * when it actually intends to animate.
 */
function Counter({ to }: { to: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.6);
  const [n, setN] = useState(to);
  const done = useRef(false);

  useIsoLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setN(0);
  }, []);

  useEffect(() => {
    if (!inView || done.current) return;
    done.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(to);
      return;
    }
    const start = performance.now();
    const DURATION = 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return (
    <span ref={ref} className="tabular">
      {n}
    </span>
  );
}

export function Proof() {
  return (
    <section id="commerces" className="mx-auto max-w-content px-5 py-20 md:px-8 lg:py-28">
      <Reveal>
        <Text variant="label" tone="muted" as="p">{proof.eyebrow}</Text>
      </Reveal>
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
        {proof.stats.map((s, i) => (
          <Reveal key={s.label} index={i}>
            <p className="font-display text-[clamp(2.75rem,6vw,4.5rem)] font-extrabold leading-none opsz-48 text-primary">
              <Counter to={s.value} />
            </p>
            <p className="mt-2 font-sans text-[0.9375rem] text-muted-foreground">{s.label}</p>
          </Reveal>
        ))}
      </div>
      <Reveal index={4}>
        <div className="mt-12 flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[58ch] font-sans text-[0.9375rem] text-muted-foreground">{proof.note}</p>
          <Badge tone="primary" className="flex shrink-0 items-center gap-1.5 !py-1.5 !px-3">
            <BadgeCheck size={13} strokeWidth={2.4} aria-hidden />
            {proof.halal}
          </Badge>
        </div>
      </Reveal>
    </section>
  );
}
