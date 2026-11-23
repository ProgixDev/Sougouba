'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, Store } from 'lucide-react';
import { AUTH_INPUT, AuthField, AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import {
  getMerchantSession,
  MerchantAuthError,
  startMerchantSignIn,
  verifyMerchantSignIn,
  type MerchantSignInError,
} from '@/lib/merchantAuth';

const ERRORS: Record<MerchantSignInError, string> = {
  code_invalid: 'Code incorrect. Vérifiez-le et réessayez.',
  code_expired: 'Ce code a expiré. Demandez-en un nouveau.',
  cooldown: 'Patientez une minute avant de demander un autre code.',
  no_shop: 'Aucune boutique n’est liée à ce compte. Inscrivez votre commerce depuis l’application Sougouba.',
  unreachable: 'Impossible de joindre le serveur. Réessayez dans un instant.',
};

const SLIDES = [
  {
    src: '/login/market.jpg',
    title: 'Vos commandes,',
    accent: 'dès qu’elles tombent',
    body: 'Suivez chaque commande de votre boutique, de l’acceptation à la livraison.',
  },
  {
    src: '/login/dish.jpg',
    title: 'Ce que vos clients',
    accent: 'pensent de vous',
    body: 'Notes, avis et signalements, au même endroit que vos ventes.',
  },
  {
    src: '/login/courier.jpg',
    title: 'Un livreur Sougouba',
    accent: 'pour chaque commande',
    body: 'Vous préparez, nous livrons : le suivi de la course est sous vos yeux.',
  },
] as const;

const BUTTON =
  'mt-1 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-terracotta-600 font-sans text-[0.9375rem] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(191,81,34,0.9)] transition-colors hover:bg-terracotta-700 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * The shop owner signs in the way they do in the app: their email, then the
 * 6-digit code sent to it. No password exists for a merchant account.
 */
export default function MerchantLoginPage() {
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
    return caught instanceof MerchantAuthError ? ERRORS[caught.code] : 'Connexion impossible. Réessayez.';
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
      title={step === 'email' ? 'Espace commerçant' : 'Vérifiez vos courriels'}
      subtitle={
        step === 'email'
          ? 'Connectez-vous avec le courriel de votre compte Sougouba : nous vous envoyons un code.'
          : `Entrez le code à 6 chiffres envoyé à ${email.trim()}.`
      }
      badge="Espace commerçant"
      slides={SLIDES}
      footer={<AuthSwitch href="/login" strong="Vous êtes administrateur ?" rest="Accédez à la console." hoverTone="forest" />}
    >
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-5" noValidate>
          <AuthField label="Courriel" htmlFor="email" invalid={!!error} hint="Le courriel de votre compte dans l’application Sougouba.">
            <Mail size={17} className="shrink-0 text-muted-foreground" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="vous@exemple.ca"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'merchant-error' : undefined}
              className={AUTH_INPUT}
            />
          </AuthField>
          {errorLine}
          <button type="submit" disabled={busy || !email.trim()} className={BUTTON}>
            {busy ? 'Envoi…' : 'Recevoir un code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-5" noValidate>
          <AuthField label="Code" htmlFor="code" invalid={!!error}>
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
            {busy ? 'Connexion…' : 'Se connecter'}
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
              Changer de courriel
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendCode()}
              className="cursor-pointer font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            >
              Renvoyer le code
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
