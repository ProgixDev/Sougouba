'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, Store } from 'lucide-react';
import { AUTH_INPUT, AuthField, AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import { t, lazy, useLocale } from '@/lib/i18n';
import {
  getMerchantSession,
  MerchantAuthError,
  startMerchantSignIn,
  verifyMerchantSignIn,
  type MerchantSignInError,
} from '@/lib/merchantAuth';

const ERRORS: Record<MerchantSignInError, string> = lazy(() => ({
  code_invalid: t('merchantLogin.errors.codeInvalid'),
  code_expired: t('merchantLogin.errors.codeExpired'),
  cooldown: t('merchantLogin.errors.cooldown'),
  no_shop: t('merchantLogin.errors.noShop'),
  unreachable: t('merchantLogin.errors.unreachable'),
}));

const SLIDES = lazy(() => ([
  {
    src: '/login/market.jpg',
    title: t('merchantLogin.slides.ordersTitle'),
    accent: t('merchantLogin.slides.ordersAccent'),
    body: t('merchantLogin.slides.ordersBody'),
  },
  {
    src: '/login/dish.jpg',
    title: t('merchantLogin.slides.reviewsTitle'),
    accent: t('merchantLogin.slides.reviewsAccent'),
    body: t('merchantLogin.slides.reviewsBody'),
  },
  {
    src: '/login/courier.jpg',
    title: t('merchantLogin.slides.courierTitle'),
    accent: t('merchantLogin.slides.courierAccent'),
    body: t('merchantLogin.slides.courierBody'),
  },
] as const));

const BUTTON =
  'mt-1 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-terracotta-600 font-sans text-[0.9375rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(191,81,34,0.9)] transition-colors hover:bg-terracotta-700 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The shop owner signs in the way they do in the app: their email, then the
 * 6-digit code sent to it. No password exists for a merchant account.
 */
export default function MerchantLoginPage() {
  useLocale();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMerchantSession()
      .then((session) => {
        if (session) router.replace('/merchant');
      })
      .catch(() => undefined);
  }, [router]);

  function messageFor(caught: unknown): string {
    return caught instanceof MerchantAuthError ? ERRORS[caught.code] : t('merchantLogin.errors.generic');
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await startMerchantSignIn(email);
      setStep('code');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await verifyMerchantSignIn(email, code);
      router.replace('/merchant');
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p id="merchant-error" role="alert" className="-mt-2 font-sans text-[0.8125rem] text-destructive">
      {error}
    </p>
  );

  return (
    <AuthShell
      tone="terracotta"
      icon={step === 'email' ? Store : KeyRound}
      title={step === 'email' ? t('merchantLogin.title') : t('merchantLogin.codeTitle')}
      subtitle={
        step === 'email'
          ? t('merchantLogin.subtitle')
          : t('merchantLogin.codeSubtitle', { email: email.trim() })
      }
      badge={t('merchantLogin.badge')}
      slides={SLIDES}
      footer={<AuthSwitch href="/login" strong={t('merchantLogin.adminQuestion')} rest={t('merchantLogin.adminLink')} hoverTone="forest" />}
    >
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-5" noValidate>
          <AuthField label={t('merchantLogin.email')} htmlFor="email" invalid={!!error} hint={t('merchantLogin.emailHint')}>
            <Mail size={17} className="shrink-0 text-muted-foreground" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t('merchantLogin.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'merchant-error' : undefined}
              className={AUTH_INPUT}
            />
          </AuthField>
          {errorLine}
          <button type="submit" disabled={busy || !email.trim()} className={BUTTON}>
            {busy ? t('merchantLogin.sending') : t('merchantLogin.getCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-5" noValidate>
          <AuthField label={t('merchantLogin.code')} htmlFor="code" invalid={!!error}>
            <KeyRound size={17} className="shrink-0 text-muted-foreground" />
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!!error}
              aria-describedby={error ? 'merchant-error' : undefined}
              className={`${AUTH_INPUT} font-semibold tracking-[0.5em] tabular`}
              autoFocus
            />
          </AuthField>
          {errorLine}
          <button type="submit" disabled={busy || code.length !== 6} className={BUTTON}>
            {busy ? t('merchantLogin.signingIn') : t('merchantLogin.signIn')}
          </button>
          <div className="flex items-center justify-center gap-4 font-sans text-[0.8125rem]">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(undefined);
              }}
              className="cursor-pointer font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('merchantLogin.changeEmail')}
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              className="cursor-pointer font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            >
              {t('merchantLogin.resend')}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
