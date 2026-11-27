'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { signIn, getSession } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { AUTH_INPUT, AuthField, AuthShell, AuthSwitch } from '@/components/auth/AuthShell';

const SLIDES = [
  {
    src: '/login/market.jpg',
    title: t('auth.slides.marketTitle'),
    accent: t('auth.slides.marketAccent'),
    body: t('auth.slides.marketBody'),
  },
  {
    src: '/login/dish.jpg',
    title: t('auth.slides.dishTitle'),
    accent: t('auth.slides.dishAccent'),
    body: t('auth.slides.dishBody'),
  },
  {
    src: '/login/courier.jpg',
    title: t('auth.slides.courierTitle'),
    accent: t('auth.slides.courierAccent'),
    body: t('auth.slides.courierBody'),
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (active && s) router.replace('/');
    });
    return () => {
      active = false;
    };
  }, [router]);

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
    <AuthShell
      tone="forest"
      icon={LogIn}
      title={t('auth.title')}
      subtitle={t('auth.subtitle')}
      badge={t('auth.badge')}
      slides={SLIDES}
      footer={<AuthSwitch href="/merchant/login" strong={t('auth.merchantQuestion')} rest={t('auth.merchantLink')} hoverTone="terracotta" />}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField label={t('auth.email')} htmlFor="email">
          <Mail size={17} className="shrink-0 text-muted-foreground" />
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
          />
        </AuthField>

        <AuthField label={t('auth.password')} htmlFor="password" invalid={!!error}>
          <LockKeyhole size={17} className="shrink-0 text-muted-foreground" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            className={AUTH_INPUT}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </AuthField>

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
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>

        <p className="text-center font-sans text-[0.8125rem] text-muted-foreground">
          {t('auth.forgot')}
        </p>
      </form>
    </AuthShell>
  );
}
