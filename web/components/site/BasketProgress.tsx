'use client';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * The page's scroll indicator, and the one place the film's narrative is stated
 * literally: a basket that fills as you go down.
 *
 * Not a progress bar. Each section that drops an item into the basket adds one
 * here, so the reader's position is expressed in the brand's own terms. The
 * silhouette is hand-drawn rather than lifted from the logo — the real mark is
 * 170 KB of paths and unreadable at 26 px.
 */
const ITEMS = [
  { cx: 9, cy: 9.5, r: 3.1, fill: '#57A379' },
  { cx: 15.5, cy: 7.4, r: 3.4, fill: '#D9642C' },
  { cx: 21.5, cy: 9.2, r: 3.0, fill: '#E4B233' },
  { cx: 12.6, cy: 11.6, r: 2.6, fill: '#9C401B' },
];

export function BasketProgress({ filled }: { filled: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <svg
      width="30"
      height="26"
      viewBox="0 0 30 26"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {ITEMS.map((it, i) => (
        <circle
          key={i}
          cx={it.cx}
          cy={it.cy}
          r={it.r}
          fill={it.fill}
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transition: 'opacity 320ms cubic-bezier(.22,1,.36,1), transform 320ms cubic-bezier(.22,1,.36,1)',
            opacity: !mounted || i < filled ? 1 : 0,
            transform: !mounted || i < filled ? 'scale(1)' : 'scale(0.3) translateY(-6px)',
          }}
        />
      ))}
      {/* The bowl, over the items, so they read as sitting inside it. */}
      <path
        d="M2.5 11.5h25l-2.6 10.2a3 3 0 0 1-2.9 2.3H8a3 3 0 0 1-2.9-2.3L2.5 11.5Z"
        fill="#F4CB92"
        stroke="#9C401B"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* The woven band, in miniature. */}
      <path d="M4.6 14.6h20.8l-.6 2.4H5.2l-.6-2.4Z" fill="#246B47" />
      <path d="M7 14.6l1.6 2.4H5.4L7 14.6Zm5.4 0L14 17h-3.2l1.6-2.4Zm5.4 0L19.4 17h-3.2l1.6-2.4Zm5.4 0L24.8 17h-3.2l1.6-2.4Z" fill="#D9642C" />
    </svg>
  );
}

/** Sections that drop an item in, in document order. */
export const BASKET_EVENTS = ['verticales', 'rayon', 'suivi', 'note'];

export function useBasketFill() {
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const targets = BASKET_EVENTS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!targets.length) return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) seen.add(e.target.id);
        // Count from the front so the basket never appears to lose an item.
        let n = 0;
        for (const id of BASKET_EVENTS) if (seen.has(id)) n++;
        setFilled(n);
      },
      { threshold: 0.35 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return filled;
}

export function cnBasket(...a: Parameters<typeof cn>) {
  return cn(...a);
}
