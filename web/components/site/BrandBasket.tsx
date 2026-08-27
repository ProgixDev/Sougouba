'use client';
import { SignalArcs } from './SignalArcs';
import { cn } from '@/lib/cn';

/**
 * The brand film, as one component: an empty woven basket that fills, then goes
 * online.
 *
 * Every layer shares one viewBox — the mark's, arcs included — so they stack at
 * inset-0 with no per-layer offsets and each lands exactly where the logo puts it.
 * The aspect below is that box; changing the artwork means regenerating the kit,
 * not nudging numbers here.
 *
 * Under reduced motion `lit` is passed true from the start, so the composition is
 * simply finished rather than animating to a finished state.
 */
const ITEMS = [1, 2, 3, 4];
export const BASKET_ASPECT = '352.7 / 321.06';

export function BrandBasket({
  lit,
  alt,
  className,
}: {
  lit: boolean;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full', className)} style={{ aspectRatio: BASKET_ASPECT }}>
      <SignalArcs lit={lit} className="absolute inset-0 h-full w-full text-terracotta-500" />
      {ITEMS.map((n, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={n}
          src={`/brand/basket-item-${n}.svg`}
          alt=""
          aria-hidden
          className={cn('basket-item absolute inset-0 h-full w-full', lit && 'is-lit')}
          style={{ '--reveal-delay': `${180 + i * 55}ms` } as React.CSSProperties}
        />
      ))}
      {/* The vessel draws last so the produce reads as sitting inside it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/basket-vessel.svg"
        alt={alt}
        className={cn(
          'basket-vessel absolute inset-0 h-full w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.07)]',
          lit && 'is-lit'
        )}
      />
    </div>
  );
}
