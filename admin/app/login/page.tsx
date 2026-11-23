'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from 'lucide-react';
import { signIn, getSession } from '@/lib/auth';
import { AUTH_INPUT, AuthField, AuthShell, AuthSwitch } from '@/components/auth/AuthShell';

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
      title="Connexion à la console"
      subtitle="Entrez le courriel et le mot de passe de votre compte administrateur."
      badge="Console d’administration"
      slides={SLIDES}
      footer={<AuthSwitch href="/merchant/login" strong="Vous êtes commerçant ?" rest="Accédez à votre espace." hoverTone="terracotta" />}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField label="Courriel" htmlFor="email">
          <Mail size={17} className="shrink-0 text-muted-foreground" />
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            placeholder="prenom@sougouba.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
          />
        </AuthField>

        <AuthField label="Mot de passe" htmlFor="password" invalid={!!error}>
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
            className={AUTH_INPUT}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="text-center font-sans text-[0.8125rem] text-muted-foreground">
          Mot de passe oublié ? Demandez à un administrateur de réinitialiser votre accès.
        </p>
      </form>
    </AuthShell>
  );
}
