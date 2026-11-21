'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/data/Skeleton';
import { createAdmin, listAdmins, revokeAdmin, type AdminAccount } from '@/lib/api/admins';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/**
 * Who can open this dashboard.
 *
 * "Ajouter" makes a new account — never an existing customer's or merchant's —
 * with a one-time password shown once, here. Pass it on privately; the new
 * administrator changes it in "Mon compte". "Retirer" removes the access at
 * once and blocks the login. You cannot remove yourself, or the last one.
 */
export default function AdminsPage() {
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);

  const load = useCallback(() => {
    listAdmins()
      .then(setAdmins)
      .catch((error: unknown) => {
        setAdmins([]);
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
      });
  }, [toast]);

  useEffect(() => {
    load();
    supabase()
      .auth.getSession()
      .then(({ data }) => setMe(data.session?.user.id ?? null));
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await createAdmin({ email: email.trim(), fullName: fullName.trim() });
      setCreated({ email: result.admin.email ?? email.trim(), password: result.temporaryPassword });
      setFullName('');
      setEmail('');
      load();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Création impossible.');
    }
    setBusy(false);
  }

  async function revoke(reason?: string) {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeAdmin(revoking.id, reason);
      toast('success', `${revoking.fullName} n’a plus accès au tableau de bord.`);
      load();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Action impossible.');
    }
    setBusy(false);
    setRevoking(null);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Administrateurs
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Les personnes qui peuvent ouvrir ce tableau de bord. Chaque ajout et chaque retrait est inscrit au journal
          d’audit.
        </Text>
      </div>

      {created && (
        <Card elevated={false} className="flex flex-col gap-3 border-forest-600/40 bg-forest-600/5 p-5">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-primary" />
            <Text variant="subtitle">Compte créé pour {created.email}</Text>
          </div>
          <Text variant="body">
            Mot de passe temporaire, affiché une seule fois — transmettez-le en privé (pas par courriel en clair si
            possible). La personne le change dans « Mon compte » après sa première connexion.
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-card px-3 py-2 font-mono text-[0.9375rem] tracking-wide">{created.password}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(created.password)
                  .then(() => toast('success', 'Mot de passe copié.'))
                  .catch(() => toast('error', 'Copie impossible — sélectionnez-le à la main.'))
              }
            >
              <Copy size={14} /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              J’ai transmis le mot de passe
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card elevated className="lg:col-span-2">
          {admins === null ? (
            <div className="p-5">
              <Skeleton className="h-40" />
            </div>
          ) : (
            <ul className="flex flex-col">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-100 font-display font-bold text-forest-700 dark:bg-forest-900 dark:text-forest-200">
                    {a.fullName.slice(0, 1) || 'A'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Text variant="body" className="font-semibold">
                        {a.fullName || '—'}
                      </Text>
                      {a.id === me && <Badge tone="primary">Vous</Badge>}
                    </div>
                    <Text variant="caption" tone="muted">
                      {a.email ?? '—'} · {a.lastSignInAt ? `dernière connexion ${formatDateTime(a.lastSignInAt)}` : 'jamais connecté'}
                    </Text>
                  </div>
                  {a.id !== me && admins.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(a)} disabled={busy}>
                      <UserMinus size={14} /> Retirer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <form onSubmit={add} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <UserPlus size={17} className="text-primary" />
              <Text variant="subtitle">Ajouter un administrateur</Text>
            </div>
            <Input label="Nom" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label="Courriel"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helper="Une adresse réservée à l’administration — pas un compte client ou commerçant existant."
            />
            <Button type="submit" disabled={busy || fullName.trim().length < 2 || !email.trim()}>
              <ShieldCheck size={15} /> Créer l’accès
            </Button>
          </form>
        </Card>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        title={`Retirer l’accès de ${revoking?.fullName ?? ''} ?`}
        description="La personne ne peut plus ouvrir le tableau de bord, dès maintenant, et son compte est bloqué. Le motif (facultatif) est inscrit au journal d’audit."
        confirmLabel="Retirer l’accès"
        tone="destructive"
        busy={busy}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
