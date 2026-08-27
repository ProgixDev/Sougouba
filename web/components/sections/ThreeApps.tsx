'use client';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Reveal, Text } from '@/components/ui';
import { threeApps } from '@/lib/content';
import { cn } from '@/lib/cn';

/**
 * The chapter that changes colour.
 *
 * The app gives each role its own surface on purpose: the customer app is
 * daylight, the merchant app is the other side of the counter, the courier gets
 * mustard on graphite. Three roles, three surfaces, recognisable before a word is
 * read. This section reproduces that by cross-fading the page ground across three
 * sub-chapters, and — the part that is easy to get wrong — moving the *ink* with
 * it. Text colour that stays put goes unreadable halfway through the transition.
 */
const THEMES = {
  client: {
    bg: 'linear-gradient(160deg,#FAF9F7 0%,#D6EBDF 55%,#FDF8E9 100%)',
    ink: '#292520',
    muted: 'rgba(41,37,32,0.66)',
    kicker: '#1C5439',
    chip: 'rgba(28,84,57,0.10)',
  },
  commerce: {
    bg: 'linear-gradient(160deg,#17422E 0%,#0A2018 100%)',
    ink: '#F3EFE6',
    muted: '#AFD7C0',
    kicker: '#AFD7C0',
    chip: 'rgba(243,239,230,0.10)',
  },
  livreur: {
    bg: 'linear-gradient(160deg,#292520 0%,#17140F 100%)',
    ink: '#F6F2E9',
    muted: '#C9C3B8',
    kicker: '#EDC957',
    chip: 'rgba(246,242,233,0.09)',
  },
} as const;

export function ThreeApps() {
  const [active, setActive] = useState<keyof typeof THEMES>('client');
  const refs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.getAttribute('data-key') as keyof typeof THEMES);
        }
      },
      // Fires as each chapter crosses the middle of the viewport.
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    );
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  const theme = THEMES[active];

  return (
    <section
      id="applications"
      /* The ground changes mid-section, so the nav's palette has to change with
         it — the attribute is the whole contract, no shared state needed. */
      data-nav-theme={active === 'client' ? 'light' : 'dark'}
      className="relative transition-[background] duration-[600ms] ease-out"
      style={{ background: theme.bg, color: theme.ink }}
    >
      {/* The mustard corner glow, on for the courier chapter only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-[600ms]"
        style={{
          opacity: active === 'livreur' ? 1 : 0,
          background: 'radial-gradient(circle at 100% 0%, rgba(228,178,51,0.18), transparent 55%)',
        }}
      />
      <div className="relative mx-auto max-w-content px-5 py-24 md:px-8 lg:py-32">
        <Reveal>
          <p
            className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] transition-colors duration-[600ms]"
            style={{ color: theme.kicker }}
          >
            {threeApps.eyebrow}
          </p>
          <h2 className="mt-3 max-w-[16ch] font-display text-[clamp(1.9rem,4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.015em] display-title">
            {threeApps.title}
          </h2>
        </Reveal>

        <div className="mt-16 space-y-24 lg:space-y-32">
          {threeApps.chapters.map((c, i) => (
            <div
              key={c.key}
              data-key={c.key}
              ref={(n) => { refs.current[i] = n; }}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
            >
              <Reveal className={cn(i % 2 === 1 && 'lg:order-2')}>
                <p
                  className="font-sans text-[0.75rem] font-semibold uppercase tracking-[0.09em] transition-colors duration-[600ms]"
                  style={{ color: theme.kicker }}
                >
                  {c.kicker}
                </p>
                <h3 className="mt-3 font-display text-[clamp(1.6rem,3.2vw,2.5rem)] font-extrabold leading-[1.08] opsz-32">
                  {c.title}
                </h3>
                <p
                  className="mt-4 max-w-[44ch] font-sans text-[1.0625rem] leading-[1.65] transition-colors duration-[600ms]"
                  style={{ color: theme.muted }}
                >
                  {c.body}
                </p>
                <ul className="mt-7 space-y-2.5">
                  {c.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 font-sans text-[0.9375rem]">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-[600ms]"
                        style={{ background: theme.chip }}
                      >
                        <Check size={12} strokeWidth={2.6} aria-hidden />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal index={1} className={cn(i % 2 === 1 && 'lg:order-1')}>
                <DeviceCluster role={c.key} />
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * One device per role, framed.
 *
 * Real 3x captures from the running app, not a CSS mock-up: an invented screen is
 * a claim about a product that exists, and a wrong one is worse than none. The
 * session is seeded straight into AsyncStorage to reach a populated state rather
 * than driving onboarding, auth and the role gate through synthetic taps.
 *
 * One device rather than a cluster, because there is one honest screen per role —
 * the same shot repeated in two frames reads as a mistake.
 */
const ALT: Record<string, string> = {
  client:
    "L'application Sougouba : l'accueil du client, avec les catégories Épicerie et Restaurant et les articles les plus vendus",
  commerce:
    'Le tableau de bord commerçant de Marché Bamako : recettes du jour et file des commandes à préparer',
  livreur:
    "L'application livreur : la carte des missions dans Villeray et Parc-Extension, avec les gains du jour",
};

function DeviceCluster({ role }: { role: 'client' | 'commerce' | 'livreur' }) {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div
        className="relative overflow-hidden rounded-[42px] border-[10px] border-neutral-950 bg-neutral-950 shadow-floating"
        style={{ aspectRatio: '1170 / 2532' }}
      >
        <picture>
          <source type="image/avif" srcSet={`/img/app/${role}.avif`} />
          <source type="image/webp" srcSet={`/img/app/${role}.webp`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/app/${role}.jpg`}
            alt={ALT[role]}
            width={1170}
            height={2532}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </picture>
      </div>
    </div>
  );
}
