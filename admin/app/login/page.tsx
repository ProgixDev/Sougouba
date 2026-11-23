'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { signIn, getSession } from '@/lib/auth';
import { LogoMark } from '@/components/layout/LogoMark';
import { cn } from '@/lib/cn';

/**
 * The right-hand panel's slides: the three things the platform moves. Photos
 * from Unsplash (free licence), served from `public/login/` so the page does
 * not depend on their CDN.
 */
const SLIDES = [
  {
    src: '/login/market.jpg',
    title: 'Les épiceries du quartier,',
    accent: 'en un seul endroit',
    body: 'Validez les commerces, suivez leurs commandes et gardez un œil sur leur catalogue.',
  },
  {
    src: '/login/dish.jpg',
    title: 'Les restaurants qui',
    accent: 'font la différence',
    body: 'Avis, codes promo et litiges : tout ce qui touche à la qualité passe par ici.',
  },
  {
    src: '/login/courier.jpg',
    title: 'Des livreurs suivis',
    accent: 'à chaque course',
    body: 'Dossiers, incidents et virements de la semaine, sans quitter la console.',
  },
] as const;

const SLIDE_MS = 6000;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (active && s) router.replace('/');
    });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, [slide]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.error);
  }

  return (
    <main className="min-h-dvh bg-background p-0 lg:p-4">
      <div className="mx-auto grid min-h-dvh max-w-[1440px] lg:min-h-[calc(100dvh-2rem)] lg:grid-cols-2 lg:gap-4">
        {/* ── The form ───────────────────────────────────────────────── */}
        <section className="flex flex-col px-5 py-6 sm:px-10 lg:py-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={40} />
            <span className="font-display text-[1.1875rem] font-bold tracking-tight">Sougouba</span>
          </div>

          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
            <div className="relative mb-8 flex flex-col items-center text-center">
              {/* A faint grid fading out around the icon, as on the brand's empty states. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-56 w-[26rem] max-w-[100vw] -translate-x-1/2 text-border [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:34px_34px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_68%)]"
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-forest-500 to-forest-700 text-white shadow-[0_14px_30px_-10px_rgba(36,107,71,0.6)]">
                <LogIn size={26} strokeWidth={2} />
              </div>
              <h1 className="relative mt-6 font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em]">
                Connexion à la console
              </h1>
              <p className="relative mt-2 font-sans text-[0.9375rem] text-muted-foreground">
                Entrez le courriel et le mot de passe de votre compte administrateur.
              </p>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
              <Field label="Courriel" htmlFor="email">
                <Mail size={17} className="shrink-0 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="prenom@sougouba.ca"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent font-sans text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground/70"
                />
              </Field>

              <Field label="Mot de passe" htmlFor="password" invalid={!!error}>
                <LockKeyhole size={17} className="shrink-0 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent font-sans text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground/70"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </Field>

              {error && (
                <p id="login-error" role="alert" className="-mt-2 font-sans text-[0.8125rem] text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="mt-1 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-forest-600 font-sans text-[0.9375rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(36,107,71,0.9)] transition-colors hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Connexion…' : 'Se connecter'}
              </button>

              {/* No social sign-in, on purpose: back-office access is an
                  account the team creates, never a Google or Apple identity. */}
              <p className="text-center font-sans text-[0.8125rem] text-muted-foreground">
                Mot de passe oublié ? Demandez à un administrateur de réinitialiser votre accès.
              </p>
            </form>

            <Link
              href="/merchant/login"
              className="group mt-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-terracotta-300"
            >
              <span className="font-sans text-[0.875rem]">
                <span className="font-semibold">Vous êtes commerçant ?</span>{' '}
                <span className="text-muted-foreground">Accédez à votre espace.</span>
              </span>
              <ArrowRight size={17} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="font-sans text-[0.75rem] text-muted-foreground">
            © {new Date().getFullYear()} Sougouba · Accès réservé à l’équipe de la plateforme
          </p>
        </section>

        {/* ── The showcase (wide screens only) ───────────────────────── */}
        <section aria-hidden className="relative hidden overflow-hidden rounded-[28px] bg-forest-900 lg:block">
          {SLIDES.map((s, i) => (
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
            <span className="h-1.5 w-1.5 rounded-full bg-forest-300" />
            Console d’administration
          </div>

          <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
            {SLIDES.map((s, i) => (
              <div
                key={s.src}
                className={cn(
                  'transition-all duration-700',
                  i === slide ? 'translate-y-0 opacity-100' : 'pointer-events-none absolute translate-y-3 opacity-0'
                )}
              >
                <h2 className="max-w-lg font-display text-[2.375rem] font-bold leading-[1.08] tracking-[-0.02em] text-white">
                  {s.title} <span className="text-mustard-300">{s.accent}</span>
                </h2>
                <p className="mt-4 max-w-md font-sans text-[1rem] leading-relaxed text-white/75">{s.body}</p>
              </div>
            ))}

            <div className="mt-8 flex gap-2">
              {SLIDES.map((s, i) => (
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
function Field({
  label,
  htmlFor,
  invalid,
  children,
}: {
  label: string;
  htmlFor: string;
  invalid?: boolean;
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
    </div>
  );
}
