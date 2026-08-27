'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { STAGGER, STAGGER_CAP } from '@/lib/motion';
import { useInView } from './useInView';

/**
 * The site's only entrance: up 18px, fade in, 380ms, ease-out, with a stagger
 * capped so a long list reads as one gesture rather than a queue.
 *
 * The hidden state lives in CSS behind `.js` (see globals.css), which is what
 * makes this safe with scripting off and correct under reduced motion. The
 * component's only job is to observe and flip a class.
 */
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const delay = Math.min(index * STAGGER, STAGGER_CAP) * 1000;
  return (
    <div
      ref={ref}
      className={cn('reveal', inView && 'is-in', className)}
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
