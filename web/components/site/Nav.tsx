'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, ThemeToggle } from '@/components/ui';
import { nav, site } from '@/lib/content';
import { cn } from '@/lib/cn';
import { BasketProgress, useBasketFill } from './BasketProgress';
import { useNavTheme } from './useNavTheme';

/**
 * Ivory, blurred, 72px. The one place on the site that uses glassmorphism, for
 * the reason the app scopes it too: it needs content moving underneath to read as
 * glass, which a sticky bar has and a static card does not.
 *
 * The right-hand action is "Inscrire ma boutique", not a download link. The apps
 * are not live, and pre-launch a grocer signing up is worth far more than a
 * shopper joining a waitlist — ten more shops is what makes the app worth
 * downloading at all. See docs/LANDING-MASTER-PROMPT.md §9.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const filled = useBasketFill();
  const onDark = useNavTheme() === 'dark';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-[72px] transition-colors duration-300',
        scrolled && !onDark && 'border-b border-border bg-background/78 backdrop-blur-xl',
        scrolled && onDark && 'border-b border-white/10 bg-forest-950/55 backdrop-blur-xl'
      )}
    >
      <div className="mx-auto flex h-full max-w-content items-center gap-4 px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${site.name} — accueil`}>
          <BasketProgress filled={filled} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark.svg"
            alt={site.name}
            className={cn('h-[22px] w-auto', onDark ? 'hidden' : 'dark:hidden')}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark-dark.svg"
            alt={onDark ? site.name : ''}
            aria-hidden={!onDark}
            className={cn('h-[22px] w-auto', onDark ? 'block' : 'hidden dark:block')}
          />
        </Link>

        <nav className="ml-auto hidden items-center gap-7 lg:flex" aria-label="Navigation principale">
          {nav.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                'font-sans text-[0.9375rem] transition-colors',
                onDark ? 'text-forest-100/80 hover:text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <ThemeToggle onDark={onDark} />
          <Button href="#partenaire" variant="cta" size="sm" className="hidden sm:inline-flex">
            {nav.cta}
          </Button>
        </div>
      </div>
    </header>
  );
}
