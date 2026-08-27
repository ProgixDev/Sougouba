'use client';
import { useState } from 'react';
import { Apple, Check, Play } from 'lucide-react';
import { Button, Input, Reveal } from '@/components/ui';
import { BrandBasket } from '@/components/site/BrandBasket';
import { finalCta } from '@/lib/content';

/**
 * The film's last frame: the basket full, the signal arc firing.
 *
 * With no app to download, this form carries every shopper conversion the site
 * will make, so it is built as a real form rather than a decoration: validation on
 * blur, the error stating cause and fix, and a success state that REPLACES the
 * field instead of a toast that vanishes.
 *
 * The endpoint is configured with NEXT_PUBLIC_WAITLIST_ENDPOINT. If it is unset
 * the form says so plainly and refuses to pretend it worked — an input that posts
 * nowhere is the single worst thing this page could ship.
 */
const ENDPOINT = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function FinalCta() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  function validate(value: string) {
    if (!value.trim()) return finalCta.errors.empty;
    if (!EMAIL_RE.test(value.trim())) return finalCta.errors.invalid;
    return undefined;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(email);
    setError(err);
    if (err) return;
    if (!ENDPOINT) {
      setError(finalCta.errors.unconfigured);
      return;
    }
    setState('sending');
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'landing' }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('done');
    } catch {
      setState('idle');
      setError(finalCta.errors.failed);
    }
  }

  return (
    /*
     * Theme-aware, deliberately. An earlier version hard-coded the mint gradient
     * in both themes, which turned this into a light island in dark mode — and
     * the sticky nav, still styled for dark, put an ivory wordmark and light-grey
     * links on it, both invisible. The merchant and courier slabs are fixed dark
     * in both themes on purpose (that is the app's role-surface language); this
     * section has no such reason, so it follows the theme.
     */
    <section
      id="prevenir"
      className="relative overflow-hidden bg-[linear-gradient(135deg,#D6EBDF_0%,#FAF9F7_45%,#FDF8E9_100%)] dark:bg-[linear-gradient(135deg,#17422E_0%,#0B1712_50%,#132420_100%)]"
    >
      <div className="mx-auto grid max-w-content items-center gap-12 px-5 py-24 md:px-8 lg:grid-cols-[1fr_0.9fr] lg:py-32">
        <div className="text-foreground">
          <Reveal>
            <h2 className="max-w-[13ch] font-display text-[clamp(2rem,4.6vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.02em] display-title">
              {finalCta.title}
            </h2>
            <p className="mt-5 max-w-[46ch] font-sans text-[1.0625rem] leading-[1.65] text-muted-foreground">
              {finalCta.body}
            </p>
          </Reveal>

          <Reveal index={1}>
            {/* Inert. The apps are not live, so these are not buttons and have no href. */}
            <div className="mt-9 flex flex-wrap gap-3">
              {[
                { Icon: Apple, label: finalCta.storeIos },
                { Icon: Play, label: finalCta.storeAndroid },
              ].map(({ Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex h-12 items-center gap-2.5 rounded-full border border-border-strong/60 bg-foreground/[0.04] px-5 font-sans text-[0.875rem] font-semibold text-muted-foreground"
                >
                  <Icon size={17} strokeWidth={2} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </Reveal>

          <Reveal index={2}>
            <div className="mt-8 max-w-[420px]">
              {state === 'done' ? (
                <div className="flex items-start gap-3 rounded-card border border-primary/25 bg-card/70 p-5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check size={15} strokeWidth={2.8} aria-hidden />
                  </span>
                  <div>
                    <p className="font-display text-[1.0625rem] font-semibold text-foreground">
                      {finalCta.success.title}
                    </p>
                    <p className="mt-1 font-sans text-[0.9375rem] text-muted-foreground">{finalCta.success.body}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Input
                    label={finalCta.emailLabel}
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(undefined); }}
                    onBlur={(e) => setError(e.target.value ? validate(e.target.value) : undefined)}
                    error={error}
                    helper={error ? undefined : finalCta.emailHelper}
                    className="sm:flex-1"
                  />
                  <Button type="submit" variant="cta" size="lg" disabled={state === 'sending'} className="h-[58px] shrink-0">
                    {finalCta.submit}
                  </Button>
                </form>
              )}
            </div>
          </Reveal>
        </div>

        <Reveal index={1}>
          <BrandBasket
            lit
            alt="Le panier Sougouba, rempli, surmonté d'un signal"
            className="mx-auto max-w-[400px]"
          />
        </Reveal>
      </div>
    </section>
  );
}
