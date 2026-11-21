'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

/** Long enough that a one-time password from "Administrateurs" is not kept by default. */
const MIN_LENGTH = 12;

/**
 * The signed-in administrator's own account: change the password — first of
 * all the one-time password a new administrator is given.
 *
 * The current password is checked first, by signing in with it: a dashboard
 * left open on someone's desk must not be enough to take the account over.
 * Everything here goes to Supabase Auth directly; the API never sees a
 * password.
 */
export default function AccountPage() {
  const toast = useToast();
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (next.length < MIN_LENGTH) return setError(`Au moins ${MIN_LENGTH} caractères.`);
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    if (next === current) return setError('Le nouveau mot de passe doit être différent de l’actuel.');
    if (!email) return setError('Session introuvable. Reconnectez-vous.');

    setBusy(true);
    const check = await supabase().auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setError('Mot de passe actuel incorrect.');
    }
    const { error: updateError } = await supabase().auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) return setError('Changement impossible. Réessayez dans un instant.');

    setCurrent('');
    setNext('');
    setConfirm('');
    toast('success', 'Mot de passe changé.');
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Mon compte
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          {email ?? '—'}
        </Text>
      </div>

      <Card className="max-w-md p-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-primary" />
            <Text variant="subtitle">Changer le mot de passe</Text>
          </div>
          <Input
            label="Mot de passe actuel"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            helper="Si vous venez d’être ajouté, c’est le mot de passe temporaire reçu."
          />
          <Input
            label="Nouveau mot de passe"
            type="password"
            required
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            helper={`Au moins ${MIN_LENGTH} caractères.`}
          />
          <Input
            label="Confirmer le nouveau mot de passe"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error}
          />
          <Button type="submit" disabled={busy || !current || !next || !confirm}>
            {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
