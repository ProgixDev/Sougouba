'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Apple, Navigation } from 'lucide-react';
import { Button } from '@/components/ui';
import { BrandBasket } from '@/components/site/BrandBasket';
import { hero, neighbourhoods } from '@/lib/content';
import { cn } from '@/lib/cn';

const TRUST_ICONS = [ShieldCheck, Apple, Navigation];

/**
 * The eight seconds that decide whether anyone scrolls.
 *
 * The basket is the film's first frame: an empty woven bowl that fills, then a
 * signal arc rising above it. Items drop in on the house spring, 55ms apart;
 * the three arcs follow, 120ms apart, and the whole thing settles. Nothing loops
 * except one slow pulse on the arcs every four seconds.
 *
 * Under reduced motion everything is already in place — basket full, arcs drawn,
 * marquee still. The animation reveals a composition that is finished either way.
 */
export function Hero() {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLit(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative overflow-hidden pt-[72px]">
      <div className="mx-auto grid max-w-content items-center gap-10 px-5 pb-16 pt-10 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pb-24 lg:pt-16">
        {/*
          min-w-0 is load-bearing: a grid item defaults to min-width:auto, so the
          marquee's `w-max` track set this column's min-content width to the full
          duplicated string and squeezed the basket column to 0px. overflow-hidden
          on the marquee alone does not shrink the item's min-content contribution.
        */}
        <div className="min-w-0">
          {/* Neighbourhoods, not cities. Paused on hover and under reduced motion. */}
          <div className="hero-marquee mb-7 max-w-full">
            <div className="hero-marquee-track flex w-max gap-3">
              {[0, 1].map((dup) => (
                <span key={dup} className="flex shrink-0 gap-3" aria-hidden={dup === 1}>
                  {neighbourhoods.map((n) => (
                    <span
                      key={n}
                      className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] text-mustard-700 dark:text-mustard-300"
                    >
                      {n}
                      <span className="ml-3 text-border-strong">·</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <h1 className="font-display text-[clamp(2.6rem,7vw,5.6rem)] font-extrabold leading-[0.96] tracking-[-0.03em] display-hero">
            {hero.headline.map((line, i) => (
              <span key={i} className="block overflow-hidden">
                <span
                  className={cn('hero-line block', lit && 'is-lit', i === 2 && 'text-primary')}
                  style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
                >
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className="mt-6 max-w-[54ch] font-sans text-[1.0625rem] leading-[1.65] text-muted-foreground">
            {hero.sub}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button href="#prevenir" variant="cta" size="lg">
              {hero.ctaPrimary}
            </Button>
            <a
              href="#partenaire"
              className="font-sans font-semibold text-foreground underline decoration-border-strong decoration-2 underline-offset-[6px] transition-colors hover:decoration-primary"
            >
              {hero.ctaSecondary}
            </a>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2">
            {hero.trust.map((t, i) => {
              const Icon = TRUST_ICONS[i];
              return (
                <li key={t} className="flex items-center gap-2 font-sans text-[0.8125rem] text-muted-foreground">
                  <Icon size={15} strokeWidth={2} className="text-primary" aria-hidden />
                  {t}
                </li>
              );
            })}
          </ul>
        </div>

        <BrandBasket
          lit={lit}
          alt="Un panier tressé rempli de produits d'épicerie africaine et maghrébine, surmonté d'un signal"
          className="mx-auto max-w-[460px]"
        />
      </div>
    </section>
  );
}
