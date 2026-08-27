'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { nav } from '@/lib/content';
import { cn } from '@/lib/cn';

/**
 * Appears once the hero has left the viewport, on small screens only, and carries
 * the merchant action — pre-launch, that is the conversion worth interrupting for.
 * Safe-area padded so it clears the gesture bar.
 */
export function StickyCta() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl transition-transform duration-300 sm:hidden',
        show ? 'translate-y-0' : 'translate-y-full'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Button href="#partenaire" variant="cta" className="h-14 flex-1">
          {nav.cta}
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Masquer"
          className="h-14 shrink-0 px-3 font-sans text-[0.8125rem] text-muted-foreground"
        >
          Masquer
        </button>
      </div>
    </div>
  );
}
