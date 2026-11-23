'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/components/layout/LogoMark';
import { cn } from '@/lib/cn';

export interface AuthSlide {
  src: string;
  title: string;
  accent: string;
  body: string;
}

type Tone = 'forest' | 'terracotta';

const TONES: Record<Tone, { tile: string; dot: string; accent: string }> = {
  forest: {
    tile: 'from-forest-500 to-forest-700 shadow-[0_14px_30px_-10px_rgba(36,107,71,0.6)]',
    dot: 'bg-forest-300',
    accent: 'text-mustard-300',
  },
  terracotta: {
    tile: 'from-terracotta-500 to-terracotta-700 shadow-[0_14px_30px_-10px_rgba(191,81,34,0.6)]',
    dot: 'bg-terracotta-300',
    accent: 'text-terracotta-300',
  },
};

const SLIDE_MS = 6000;

/**
 * The two sign-in pages' frame: the form on the left, and on wide screens a
 * panel of brand photos rotating with a headline each. Photos come from
 * Unsplash (free licence) and are served from `public/login/`.
 *
 * Deliberately no social sign-in slot: back-office and merchant access are
 * accounts the platform knows, never a Google or Apple identity.
 */
export function AuthShell({
  tone,
  icon: Icon,
  title,
  subtitle,
  badge,
  slides,
  footer,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** The chip at the top of the photo panel. */
  badge: string;
  slides: readonly AuthSlide[];
  /** Under the form: the link to the other sign-in page. */
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [slide, setSlide] = useState(0);
  const t = TONES[tone];

  useEffect(() => {
    const timer = setInterval(() => setSlide((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slide, slides.length]);

  return (
    <main className="min-h-dvh bg-background p-0 lg:p-4">
      <div className="mx-auto grid min-h-dvh max-w-[1440px] lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-2 lg:gap-4">
        <section className="flex flex-col px-5 py-6 sm:px-10 lg:py-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={40} />
            <span className="font-display text-[1.1875rem] font-bold tracking-tight">Sougouba</span>
          </div>

          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
            <div className="relative mb-8 flex flex-col items-center text-center">
              {/* A faint grid fading out around the icon. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-56 w-[26rem] max-w-[100vw] -translate-x-1/2 text-border [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:34px_34px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_68%)]"
              />
              <div className={cn('relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white', t.tile)}>
                <Icon size={26} strokeWidth={2} />
              </div>
              <h1 className="relative mt-6 font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
              <p className="relative mt-2 font-sans text-[0.9375rem] text-muted-foreground">{subtitle}</p>
            </div>

            {children}

            <div className="mt-10">{footer}</div>
          </div>

          <p className="font-sans text-[0.75rem] text-muted-foreground">
            © {new Date().getFullYear()} Sougouba
          </p>
        </section>

        <section aria-hidden className="relative hidden overflow-hidden rounded-[28px] bg-forest-900 lg:block">
          {slides.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- three static photos, swapped by opacity
            <img
              key={s.src}
              src={s.src}
              alt=""
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-out',
                i === slide ? 'scale-100 opacity-100' : 'scale-105 opacity-0'
              )}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1712] via-[#0B1712]/45 to-[#0B1712]/10" />

          <div className="absolute left-8 top-8 flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 font-sans text-[0.75rem] font-semibold text-white backdrop-blur-md">
            <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />
            {badge}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
            {slides.map((s, i) => (
              <div
                key={s.src}
                className={cn(
                  'transition-all duration-700',
                  i === slide ? 'translate-y-0 opacity-100' : 'pointer-events-none absolute translate-y-3 opacity-0'
                )}
              >
                <h2 className="max-w-lg font-display text-[2.375rem] font-bold leading-[1.08] tracking-[-0.02em] text-white">
                  {s.title} <span className={t.accent}>{s.accent}</span>
                </h2>
                <p className="mt-4 max-w-md font-sans text-[1rem] leading-relaxed text-white/75">{s.body}</p>
              </div>
            ))}

            <div className="mt-8 flex gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setSlide(i)}
                  className={cn(
                    'h-1.5 cursor-pointer rounded-full transition-all duration-500',
                    i === slide ? 'w-10 bg-white' : 'w-5 bg-white/35 hover:bg-white/60'
                  )}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** A label above a bordered row holding an icon, the input and any trailing control. */
export function AuthField({
  label,
  htmlFor,
  invalid,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  invalid?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-sans text-[0.875rem] font-semibold">
        {label}
      </label>
      <div
        className={cn(
          'flex h-12 items-center gap-3 rounded-xl border-[1.5px] bg-card pl-4 pr-2 transition-[border-color,box-shadow]',
          'focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgb(var(--color-ring)/0.12)]',
          invalid ? 'border-destructive' : 'border-border'
        )}
      >
        {children}
      </div>
      {hint && <p className="font-sans text-[0.8125rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The input inside an `AuthField`. */
export const AUTH_INPUT =
  'h-full min-w-0 flex-1 bg-transparent font-sans text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground/70';

/** The link card under a form that leads to the other sign-in page. */
export function AuthSwitch({ href, strong, rest, hoverTone }: { href: string; strong: string; rest: string; hoverTone: Tone }) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors',
        hoverTone === 'forest' ? 'hover:border-forest-300' : 'hover:border-terracotta-300'
      )}
    >
      <span className="font-sans text-[0.875rem]">
        <span className="font-semibold">{strong}</span> <span className="text-muted-foreground">{rest}</span>
      </span>
      <ArrowRight size={17} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
