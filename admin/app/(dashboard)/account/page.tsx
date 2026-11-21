'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, Clock, KeyRound, LogOut, Mail, Moon, ShieldCheck, Star, Sun, UserRound, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/data/Skeleton';
import { getMyActivity, getPermissionCatalogue, updateMyName, type PermissionGroup } from '@/lib/api/admins';
import type { AuditEntry } from '@/lib/api/audit';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/** Long enough that a one-time password from "Administrateurs" is not kept by default. */
const MIN_LENGTH = 12;

const ACTION_LABELS: Record<string, string> = {
  'vendor.approve': 'Commerce approuvé',
  'vendor.reject': 'Commerce refusé',
  'vendor.suspend': 'Commerce suspendu',
  'courier.approve': 'Livreur approuvé',
  'courier.reject': 'Livreur refusé',
  'courier.suspend': 'Livreur suspendu',
  'user.block': 'Compte bloqué',
  'user.unblock': 'Compte débloqué',
  'dispute.resolve': 'Litige résolu',
  'courier_issue.resolve': 'Incident résolu',
  'order.refund': 'Commande remboursée',
  'settings.update': 'Paramètres modifiés',
  'specialty.create': 'Spécialité ajoutée',
  'specialty.update': 'Spécialité modifiée',
  'support.reply': 'Réponse au support',
  'support.resolve': 'Support résolu',
  'review.moderate': 'Avis modéré',
  'coupon.deactivate': 'Code promo désactivé',
  'product.hide': 'Produit masqué',
  'product.unhide': 'Produit réaffiché',
  'admin.create': 'Administrateur ajouté',
  'admin.revoke': 'Administrateur retiré',
  'admin.role_change': 'Rôle changé',
  'role.create': 'Rôle créé',
  'role.update': 'Rôle modifié',
  'role.delete': 'Rôle supprimé',
};

/**
 * The signed-in administrator's own page: who they are, what their role lets
 * them do, their own recent actions, their password and sessions, and how
 * the dashboard looks.
 *
 * Password and sessions go to Supabase Auth directly — the API never sees a
 * password. The name goes through the API's ordinary profile endpoint.
 */
export default function AccountPage() {
  const { me } = useAdmin();
  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Header />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <RoleCard />
          <Activity />
        </div>
        <div className="flex flex-col gap-4">
          <NameCard key={me.fullName} />
          <PasswordCard />
          <SessionsCard />
          <AppearanceCard />
        </div>
      </div>
    </div>
  );
}

function Header() {
  const { me } = useAdmin();
  return (
    <Card elevated className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-mustard-400 font-display text-[2rem] font-bold text-mustard-950">
        {(me.fullName || 'A').slice(0, 1)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="h1" variant="display" className="truncate">
            {me.fullName || 'Administrateur'}
          </Text>
          {me.role && <Badge tone={me.role.slug === 'owner' ? 'secondary' : 'primary'}>{me.role.name}</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Meta icon={Mail} text={me.email ?? '—'} />
          <Meta icon={Star} text={me.memberSince ? `Membre depuis le ${formatDate(me.memberSince)}` : 'Membre'} />
          <Meta icon={Clock} text={me.lastSignInAt ? `Dernière connexion ${formatDateTime(me.lastSignInAt)}` : '—'} />
        </div>
      </div>
    </Card>
  );
}

function Meta({ icon: Icon, text }: { icon: typeof Mail; text: string }) {
  return (
    <span className="flex items-center gap-1.5 font-sans text-[0.8125rem] text-muted-foreground">
      <Icon size={14} /> {text}
    </span>
  );
}

function RoleCard() {
  const { me } = useAdmin();
  const [catalogue, setCatalogue] = useState<PermissionGroup[] | null>(null);
  const held = useMemo(() => new Set(me.permissions), [me.permissions]);

  useEffect(() => {
    // The catalogue sits behind `admins.view`; without it the summary falls
    // back to the raw permission list rather than failing the page.
    getPermissionCatalogue()
      .then(setCatalogue)
      .catch(() => setCatalogue([]));
  }, []);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          <Text variant="subtitle">Mon rôle : {me.role?.name ?? '—'}</Text>
        </div>
        <Text variant="caption" tone="muted">
          {me.permissions.length} permission{me.permissions.length > 1 ? 's' : ''}
        </Text>
      </div>
      {me.role?.description && (
        <Text variant="body" tone="muted">
          {me.role.description}
        </Text>
      )}

      {catalogue === null ? (
        <Skeleton className="h-40" />
      ) : catalogue.length === 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {me.permissions.map((p) => (
            <span key={p} className="rounded-full bg-muted px-2.5 py-1 font-mono text-[0.6875rem]">
              {p}
            </span>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalogue.map((group) => {
            const has = group.permissions.filter((p) => held.has(p.key));
            return (
              <li
                key={group.area}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                  has.length ? 'border-forest-600/30' : 'border-border opacity-50'
                }`}
              >
                {has.length ? (
                  <Check size={15} className="mt-0.5 shrink-0 text-primary" />
                ) : (
                  <X size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <Text variant="body" className="font-semibold">
                    {group.area}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {has.length ? has.map((p) => p.label).join(' · ') : 'Pas d’accès'}
                  </Text>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Text variant="caption" tone="muted">
        Votre rôle est attribué par un administrateur qui gère les accès. Pour en changer, demandez-lui.
      </Text>
    </Card>
  );
}

function Activity() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getMyActivity(0, 15)
      .then((page) => {
        setRows(page.items);
        setTotal(page.total);
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Text variant="subtitle">Mon activité récente</Text>
        <Text variant="caption" tone="muted">
          {total} action{total > 1 ? 's' : ''} au total
        </Text>
      </div>
      {rows === null ? (
        <Skeleton className="h-32" />
      ) : rows.length === 0 ? (
        <Text variant="body" tone="muted">
          Aucune action enregistrée pour l’instant.
        </Text>
      ) : (
        <ol className="flex flex-col">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
              <div className="min-w-0">
                <Text variant="body" className="font-medium">
                  {ACTION_LABELS[e.action] ?? e.action}
                </Text>
                <Text variant="caption" tone="muted" className="line-clamp-1">
                  {[e.subjectLabel, e.reason ? `« ${e.reason} »` : null].filter(Boolean).join(' · ') || '—'}
                </Text>
              </div>
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                {formatDateTime(e.createdAt)}
              </Text>
            </li>
          ))}
        </ol>
      )}
      {total > (rows?.length ?? 0) && (
        <Text variant="caption" tone="muted" className="mt-2 block">
          Les {rows?.length} plus récentes sont affichées.
        </Text>
      )}
    </Card>
  );
}

function NameCard() {
  const { me, reload } = useAdmin();
  const toast = useToast();
  const [name, setName] = useState(me.fullName);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== me.fullName && name.trim().length >= 2;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyName(name.trim());
      await reload();
      toast('success', 'Nom mis à jour.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Enregistrement impossible.');
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <UserRound size={17} className="text-primary" />
          <Text variant="subtitle">Mes informations</Text>
        </div>
        <Input label="Nom affiché" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} helper="Visible dans le journal d’audit et la liste des administrateurs." />
        <Input label="Courriel" value={me.email ?? ''} disabled helper="Pour changer d’adresse, un administrateur qui gère les accès doit créer un nouvel accès." />
        <Button type="submit" variant="outline" disabled={busy || !changed}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * The current password is checked first, by signing in with it: a dashboard
 * left open on someone's desk must not be enough to take the account over.
 */
function PasswordCard() {
  const { me } = useAdmin();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (next.length < MIN_LENGTH) return setError(`Au moins ${MIN_LENGTH} caractères.`);
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    if (next === current) return setError('Le nouveau mot de passe doit être différent de l’actuel.');
    if (!me.email) return setError('Session introuvable. Reconnectez-vous.');

    setBusy(true);
    const check = await supabase().auth.signInWithPassword({ email: me.email, password: current });
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
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-primary" />
          <Text variant="subtitle">Mot de passe</Text>
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
          label="Confirmer"
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
  );
}

function SessionsCard() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function signOutOthers() {
    setBusy(true);
    const { error } = await supabase().auth.signOut({ scope: 'others' });
    setBusy(false);
    if (error) toast('error', 'Déconnexion impossible. Réessayez dans un instant.');
    else toast('success', 'Vos autres sessions sont déconnectées.');
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <LogOut size={17} className="text-primary" />
        <Text variant="subtitle">Sessions</Text>
      </div>
      <Text variant="body" tone="muted">
        Un ordinateur oublié ou un appareil perdu ? Déconnectez toutes vos sessions sauf celle-ci. Elles devront se
        reconnecter avec votre mot de passe.
      </Text>
      <Button variant="outline" onClick={signOutOthers} disabled={busy}>
        {busy ? 'Déconnexion…' : 'Déconnecter mes autres sessions'}
      </Button>
      <Link href="/audit" className="font-sans text-[0.75rem] text-muted-foreground hover:text-foreground hover:underline">
        Les actions de chacun restent dans le journal d’audit.
      </Link>
    </Card>
  );
}

function AppearanceCard() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  function choose(nextDark: boolean) {
    setDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      // The same key the top bar's switch writes, so the two never disagree.
      localStorage.setItem('sougouba-admin-theme', nextDark ? 'dark' : 'light');
    } catch {}
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Text variant="subtitle">Apparence</Text>
      <div className="grid grid-cols-2 gap-2">
        {[
          { dark: false, label: 'Clair', icon: Sun },
          { dark: true, label: 'Sombre', icon: Moon },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => choose(o.dark)}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
              dark === o.dark ? 'border-forest-600 bg-forest-600/10' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <o.icon size={15} /> {o.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
