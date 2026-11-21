'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { signIn, getSession, DEMO_CREDENTIALS } from '@/lib/auth';
import { useEffect } from 'react';
import { LogoMark } from '@/components/layout/LogoMark';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    // The mock wrapped a synchronous string compare in a 350 ms setTimeout to
    // fake latency. This is the real request that replaced it.
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.error);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} className="mb-3" />
          <Text variant="title">Console d&apos;administration</Text>
          <Text variant="body" tone="muted" className="mt-1">
            Sougouba — accès réservé à l&apos;équipe plateforme
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
          <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
          <LockKeyhole size={15} className="mt-0.5 shrink-0" />
          <Text variant="caption">
            Démo : {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
          </Text>
        </div>
        <Link
          href="/merchant/login"
          className="mt-4 block text-center font-sans text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Vous êtes commerçant ? Accédez à votre espace →
        </Link>
      </Card>
    </main>
  );
}
