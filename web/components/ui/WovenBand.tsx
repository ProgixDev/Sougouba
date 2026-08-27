'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { BAND_H, BAND_HALF, bandCountFor, buildBand, type BandVariant } from '@/lib/band';
import { BAND_CAP, BAND_STAGGER } from '@/lib/motion';
import { useInView } from './useInView';

/**
 * The page's only divider.
 *
 * Rendered inline rather than as a CSS background so every triangle is its own
 * node and can be staggered — the band weaves itself in left to right, 24ms
 * apart, capped at 400ms. The logo's basket carries this motif; it replaces every
 * rule, gradient blob and "decorative shape" the page would otherwise reach for.
 *
 * Use variant="dark" on any ground darker than neutral-300: on the forest slab
 * the light band's forest triangles sink into the background and leave the dots
 * floating on nothing.
 */
export function WovenBand({
  variant = 'light',
  height = 24,
  className,
  animate = true,
}: {
  variant?: BandVariant;
  height?: number;
  className?: string;
  animate?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  // The server renders assuming a wide viewport; the count corrects on mount.
  // The band is decorative, so a first-paint count slightly off costs nothing.
  const [count, setCount] = useState(() => bandCountFor(1440, height));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setCount(bandCountFor(el.offsetWidth, height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const shapes = buildBand(count, variant);
  const width = count * BAND_HALF;
  const shown = inView || !animate;

  return (
    <div
      ref={(n) => {
        wrap.current = n;
        ref.current = n;
      }}
      className={cn('w-full overflow-hidden', className)}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${BAND_H}`}
        preserveAspectRatio="xMinYMid slice"
        role="presentation"
        focusable="false"
      >
        {shapes.map((s, n) => {
          const style = {
            '--reveal-delay': `${Math.min(Math.max(s.i, 0) * BAND_STAGGER, BAND_CAP) * 1000}ms`,
          } as React.CSSProperties;
          const cls = cn('band-shape', shown && 'is-in');
          return s.kind === 'triangle' ? (
            <path key={n} d={s.d} fill={s.fill} className={cls} style={style} />
          ) : (
            <ellipse key={n} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.fill} className={cls} style={style} />
          );
        })}
      </svg>
    </div>
  );
}
