'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LogoMark } from '@/components/layout/LogoMark';
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

  async function sendCode(e: FormEvent) {
    e.preventDefault();
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <Text variant="title">Espace commerçant</Text>
          <Text variant="body" tone="muted" className="mt-1">
            Sougouba — suivez les commandes de votre boutique
          </Text>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <Input
              label="Courriel"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              helper="Le courriel de votre compte dans l’application Sougouba."
              error={error}
            />
            <Button type="submit" size="lg" variant="cta" className="mt-1 w-full" disabled={busy}>
              {busy ? 'Envoi…' : 'Recevoir un code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
              <Mail size={15} className="mt-0.5 shrink-0" />
              <Text variant="caption">Un code à 6 chiffres a été envoyé à {email.trim()}.</Text>
            </div>
            <Input
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              error={error}
            />
            <Button type="submit" size="lg" variant="cta" className="mt-1 w-full" disabled={busy || code.length !== 6}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(undefined);
              }}
              className="font-sans text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Changer de courriel
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-4 block text-center font-sans text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Vous êtes administrateur Sougouba ? →
        </Link>
      </Card>
    </main>
  );
}
