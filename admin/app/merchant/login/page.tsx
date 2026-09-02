'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { merchantSignIn, getMerchantSession, demoMerchantAccounts, MERCHANT_DEMO_PASSWORD } from '@/lib/merchantAuth';

export default function MerchantLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const demoAccounts = demoMerchantAccounts();

  useEffect(() => {
    if (getMerchantSession()) router.replace('/merchant');
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setTimeout(() => {
      const result = merchantSignIn(email, password);
      setBusy(false);
      if (result.ok) router.replace('/merchant');
      else setError(result.error);
    }, 350);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-terracotta-600 font-display text-[1.3rem] font-bold text-white">
            S
          </div>
          <Text variant="title">Espace commerçant</Text>
          <Text variant="body" tone="muted" className="mt-1">
            Sougouba — suivez les commandes de votre boutique
          </Text>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input label="Courriel" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <Input
            label="Mot de passe"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            error={error}
          />
          <Button type="submit" size="lg" variant="cta" className="mt-1 w-full" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
        <div className="mt-5 flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-muted-foreground">
          <div className="flex items-start gap-2">
            <LockKeyhole size={15} className="mt-0.5 shrink-0" />
            <Text variant="caption">Démo — mot de passe : {MERCHANT_DEMO_PASSWORD}</Text>
          </div>
          {demoAccounts.map((a) => (
            <Text key={a.email} variant="caption" className="pl-[23px]">
              {a.email} — {a.vendorName}
            </Text>
          ))}
        </div>
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
