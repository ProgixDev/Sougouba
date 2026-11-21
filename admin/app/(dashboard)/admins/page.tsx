'use client';
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Copy, KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/data/Skeleton';
import {
  createAdmin,
  createRole,
  deleteRole,
  getPermissionCatalogue,
  listAdmins,
  listRoles,
  revokeAdmin,
  setAdminRole,
  updateRole,
  type AdminAccount,
  type AdminRole,
  type PermissionGroup,
} from '@/lib/api/admins';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAdmin } from '@/lib/permissions';

const SELECT =
  'w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 font-sans text-[0.875rem] text-foreground outline-none focus:border-forest-600';

/**
 * The back-office team and what each member may do.
 *
 * Two tabs. "Membres": who has access, with which role — add someone (a new
 * account with a one-time password), change a role, remove access. "Rôles":
 * the five built-in roles, which cannot be changed, and custom ones built from
 * the permission catalogue. Every change is in the audit log, and the API
 * refuses anything that would leave nobody able to manage administrators.
 */
export default function AdminsPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-content rounded-card" />}>
      <Admins />
    </Suspense>
  );
}

function Admins() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'members';
  const toast = useToast();
  const { can } = useAdmin();
  const manage = can('admins.manage');

  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [roles, setRoles] = useState<AdminRole[] | null>(null);
  const [catalogue, setCatalogue] = useState<PermissionGroup[]>([]);

  const load = useCallback(() => {
    Promise.all([listAdmins(), listRoles(), getPermissionCatalogue()])
      .then(([a, r, c]) => {
        setAdmins(a);
        setRoles(r);
        setCatalogue(c);
      })
      .catch((error: unknown) => {
        setAdmins([]);
        setRoles([]);
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
      });
  }, [toast]);

  useEffect(load, [load]);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Administrateurs
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Qui peut ouvrir ce tableau de bord, et ce que chacun peut y faire. Chaque changement est inscrit au journal
          d’audit.
        </Text>
      </div>

      <div className="flex gap-1.5 self-start rounded-full border border-border bg-card p-1">
        {[
          { key: 'members', label: `Membres${admins ? ` · ${admins.length}` : ''}`, icon: Users },
          { key: 'roles', label: `Rôles${roles ? ` · ${roles.length}` : ''}`, icon: ShieldCheck },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => router.replace(`${pathname}?tab=${t.key}`)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
              tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {admins === null || roles === null ? (
        <Skeleton className="h-96 rounded-card" />
      ) : tab === 'members' ? (
        <Members admins={admins} roles={roles} catalogue={catalogue} manage={manage} onChanged={load} />
      ) : (
        <Roles roles={roles} catalogue={catalogue} manage={manage} onChanged={load} />
      )}
    </div>
  );
}

// ── members ─────────────────────────────────────────────────────────────────

function Members({
  admins,
  roles,
  catalogue,
  manage,
  onChanged,
}: {
  admins: AdminAccount[];
  roles: AdminRole[];
  catalogue: PermissionGroup[];
  manage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { me } = useAdmin();
  const [dialog, setDialog] = useState<AdminAccount | 'new' | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; role: string } | null>(null);
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeRole(admin: AdminAccount, roleId: string) {
    if (roleId === admin.role?.id) return;
    setBusy(true);
    try {
      const updated = await setAdminRole(admin.id, roleId);
      toast('success', `${admin.fullName} est maintenant « ${updated.role?.name ?? '—'} ».`);
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Changement impossible.');
    }
    setBusy(false);
  }

  async function revoke(reason?: string) {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeAdmin(revoking.id, reason);
      toast('success', `${revoking.fullName} n’a plus accès au tableau de bord.`);
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Action impossible.');
    }
    setBusy(false);
    setRevoking(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {created && (
        <Card elevated={false} className="flex flex-col gap-3 border-forest-600/40 bg-forest-600/5 p-5">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-primary" />
            <Text variant="subtitle">
              Accès créé pour {created.email} — {created.role}
            </Text>
          </div>
          <Text variant="body">
            Mot de passe temporaire, affiché une seule fois. Transmettez-le en privé ; la personne le change dans « Mon
            compte » après sa première connexion.
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

      {manage && (
        <Button className="self-start" onClick={() => setDialog('new')}>
          <UserPlus size={15} /> Ajouter un administrateur
        </Button>
      )}
      {dialog !== null && (
        <AccessDialog
          admin={dialog === 'new' ? null : dialog}
          roles={roles}
          catalogue={catalogue}
          onClose={() => setDialog(null)}
          onDone={({ created: made }) => {
            if (made) setCreated(made);
            setDialog(null);
            onChanged();
          }}
        />
      )}

      <Card elevated className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              {['Administrateur', 'Rôle', 'Dernière connexion', 'Membre depuis', ''].map((h) => (
                <th key={h} className="px-5 py-3 font-sans text-[0.75rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isMe = a.id === me.id;
              return (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5">
                    <Link href={`/admins/${a.id}`} className="flex items-center gap-3 hover:opacity-80">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-100 font-display font-bold text-forest-700 dark:bg-forest-900 dark:text-forest-200">
                        {a.fullName.slice(0, 1) || 'A'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Text variant="body" className="font-semibold">
                            {a.fullName || '—'}
                          </Text>
                          {isMe && <Badge tone="primary">Vous</Badge>}
                        </div>
                        <Text variant="caption" tone="muted">
                          {a.email ?? '—'}
                        </Text>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    {/* Your own role is changed by someone else: one slip here
                        and you could lose the screen you are standing on. */}
                    {manage && !isMe ? (
                      <select
                        value={a.role?.id ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          e.target.value === CUSTOM ? setDialog(a) : changeRole(a, e.target.value)
                        }
                        className={`${SELECT} max-w-[220px]`}
                        aria-label={`Rôle de ${a.fullName}`}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                        <option value={CUSTOM}>Personnaliser…</option>
                      </select>
                    ) : (
                      <Badge tone={a.role?.slug === 'owner' ? 'secondary' : 'neutral'}>{a.role?.name ?? '—'}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Text variant="body" tone="muted">
                      {a.lastSignInAt ? formatDateTime(a.lastSignInAt) : 'Jamais connecté'}
                    </Text>
                  </td>
                  <td className="px-5 py-3.5">
                    <Text variant="body" tone="muted">
                      {a.memberSince ? formatDate(a.memberSince) : '—'}
                    </Text>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {manage && !isMe && (
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(a)} disabled={busy}>
                        <UserMinus size={14} /> Retirer
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

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

const CUSTOM = '__custom';

/**
 * Who gets access, and to exactly what — one dialog for a new administrator
 * and for changing an existing one's access.
 *
 * Picking a role ticks its modules; ticking or unticking anything turns the
 * choice into "Personnalisé". On save, ticks that match an existing role use
 * that role; anything else becomes a custom role named after the person
 * ("Personnalisé — Awa Diallo"), listed in the Rôles tab like any other — so
 * every administrator still has exactly one role, and every permission still
 * lives in one place.
 */
function AccessDialog({
  admin,
  roles,
  catalogue,
  onClose,
  onDone,
}: {
  /** Null to add someone; an administrator to change their access. */
  admin: AdminAccount | null;
  roles: AdminRole[];
  catalogue: PermissionGroup[];
  onClose: () => void;
  onDone: (result: { created?: { email: string; password: string; role: string } }) => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState(admin?.fullName ?? '');
  const [email, setEmail] = useState('');
  // The least-powerful built-in role first: access is granted, not assumed.
  const initialRole = admin?.role
    ? roles.find((r) => r.id === admin.role!.id)
    : (roles.find((r) => r.slug === 'readonly') ?? roles[0]);
  const [roleId, setRoleId] = useState(initialRole?.id ?? CUSTOM);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialRole?.permissions ?? ['dashboard.view']));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** The role whose permissions are exactly these ticks, if one exists. */
  function matchingRole(set: Set<string>) {
    return roles.find((r) => r.permissions.length === set.size && r.permissions.every((p) => set.has(p)));
  }

  function pickRole(id: string) {
    setRoleId(id);
    const role = roles.find((r) => r.id === id);
    if (role) setSelected(new Set(role.permissions));
  }

  function update(next: Set<string>) {
    setSelected(next);
    setRoleId(matchingRole(next)?.id ?? CUSTOM);
  }

  /** A module's checkbox is its "view"; turning it off takes its action with it. */
  function toggleModule(group: PermissionGroup) {
    const view = group.permissions[0].key;
    const next = new Set(selected);
    if (next.has(view)) group.permissions.forEach((p) => next.delete(p.key));
    else next.add(view);
    update(next);
  }

  /** An action brings its view: acting on something you cannot see makes no sense. */
  function toggleAction(group: PermissionGroup, key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      next.add(group.permissions[0].key);
    }
    update(next);
  }

  const modulesOn = catalogue.filter((g) => g.permissions.some((p) => selected.has(p.key))).length;

  async function resolveRoleId(): Promise<{ id: string; name: string }> {
    const existing = roles.find((r) => r.id === roleId) ?? matchingRole(selected);
    if (existing) return { id: existing.id, name: existing.name };
    const base = `Personnalisé — ${fullName.trim()}`.slice(0, 40);
    const input = {
      description: `Accès sur mesure pour ${fullName.trim()}.`,
      permissions: [...selected],
    };
    try {
      const role = await createRole({ ...input, name: base });
      return { id: role.id, name: role.name };
    } catch {
      // The name is taken (same person, or a namesake): make it distinct.
      const role = await createRole({ ...input, name: `${base.slice(0, 34)} · ${Math.random().toString(36).slice(2, 6)}` });
      return { id: role.id, name: role.name };
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const role = await resolveRoleId();
      if (admin) {
        await setAdminRole(admin.id, role.id);
        toast('success', `Accès de ${admin.fullName} mis à jour — ${role.name}.`);
        onDone({});
      } else {
        const result = await createAdmin({ email: email.trim(), fullName: fullName.trim(), roleId: role.id });
        onDone({ created: { email: result.admin.email ?? email.trim(), password: result.temporaryPassword, role: role.name } });
      }
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Enregistrement impossible.');
    }
    setBusy(false);
  }

  const canSubmit = selected.size > 0 && (admin !== null || (fullName.trim().length >= 2 && email.trim().length > 0));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={admin ? `Accès de ${admin.fullName}` : 'Ajouter un administrateur'}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} className="my-6 flex w-full max-w-2xl flex-col gap-5 rounded-card bg-card p-6 shadow-xl sm:p-8">
        <Text variant="title">{admin ? `Accès de ${admin.fullName}` : 'Ajouter un administrateur'}</Text>

        {!admin && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nom et prénom" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label="Courriel professionnel"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helper="Une adresse réservée à l’administration."
            />
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-[0.8125rem] font-semibold">Rôle</span>
          <select value={roleId} onChange={(e) => pickRole(e.target.value)} className={SELECT}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isSystem ? '' : ' (personnalisé)'}
              </option>
            ))}
            <option value={CUSTOM} disabled={roleId !== CUSTOM}>
              Personnalisé — selon les modules cochés
            </option>
          </select>
          <span className="font-sans text-[0.75rem] text-muted-foreground">
            {roleId === CUSTOM
              ? 'Un rôle sur mesure sera créé pour cette personne, visible dans l’onglet Rôles.'
              : roles.find((r) => r.id === roleId)?.description}
          </span>
        </label>

        <div className="flex flex-col gap-2.5">
          <Text variant="label">
            Modules autorisés ({modulesOn} / {catalogue.length})
          </Text>
          <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
            {catalogue.map((group) => {
              const [view, ...actions] = group.permissions;
              const on = selected.has(view.key);
              return (
                <div
                  key={group.area}
                  className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors ${
                    on ? 'border-forest-600/40 bg-card' : 'border-transparent'
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleModule(group)}
                      className="h-4 w-4 cursor-pointer accent-forest-600"
                    />
                    <span className="font-sans text-[0.875rem] font-semibold">{group.area}</span>
                  </label>
                  {actions.map((action) => (
                    <label key={action.key} className="ml-6 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(action.key)}
                        onChange={() => toggleAction(group, action.key)}
                        className="h-3.5 w-3.5 cursor-pointer accent-forest-600"
                      />
                      <span className="font-sans text-[0.75rem] text-muted-foreground">{action.label}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          {selected.has('admins.manage') && (
            <Text variant="caption" tone="accent">
              « Administrateurs » permet d’ajouter, retirer et changer les accès de tous — le droit le plus étendu.
            </Text>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            <ShieldCheck size={15} /> {busy ? 'Enregistrement…' : admin ? 'Enregistrer l’accès' : 'Créer l’accès'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── roles ───────────────────────────────────────────────────────────────────

function Roles({
  roles,
  catalogue,
  manage,
  onChanged,
}: {
  roles: AdminRole[];
  catalogue: PermissionGroup[];
  manage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminRole | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteRole(deleting.id);
      toast('success', `Rôle « ${deleting.name} » supprimé.`);
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Suppression impossible.');
    }
    setBusy(false);
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {manage && editing === null && (
        <Button className="self-start" onClick={() => setEditing('new')}>
          <Plus size={15} /> Nouveau rôle
        </Button>
      )}
      {editing !== null && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          roles={roles}
          catalogue={catalogue}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Text variant="subtitle">{r.name}</Text>
                  {r.isSystem ? (
                    <Badge tone="neutral">
                      <Lock size={11} className="mr-1 inline" />
                      Prédéfini
                    </Badge>
                  ) : (
                    <Badge tone="primary">Personnalisé</Badge>
                  )}
                </div>
                <Text variant="caption" tone="muted">
                  {r.description || '—'}
                </Text>
              </div>
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                {r.adminCount} membre{r.adminCount > 1 ? 's' : ''}
              </Text>
            </div>
            <PermissionSummary permissions={r.permissions} catalogue={catalogue} />
            {manage && !r.isSystem && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Pencil size={14} /> Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={r.adminCount > 0}
                  title={r.adminCount > 0 ? 'Attribué à des administrateurs — changez d’abord leur rôle.' : undefined}
                  onClick={() => setDeleting(r)}
                >
                  <Trash2 size={14} /> Supprimer
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Supprimer le rôle « ${deleting?.name ?? ''} » ?`}
        description="Aucun administrateur n’a ce rôle. La suppression est inscrite au journal d’audit."
        confirmLabel="Supprimer"
        tone="destructive"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function RoleEditor({
  role,
  roles,
  catalogue,
  onCancel,
  onSaved,
}: {
  role: AdminRole | null;
  roles: AdminRole[];
  catalogue: PermissionGroup[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? ['dashboard.view']));
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Acting on something you cannot see makes no sense: an action brings its view.
        const view = `${key.split('.')[0]}.view`;
        if (catalogue.some((g) => g.permissions.some((p) => p.key === view))) next.add(view);
      }
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const input = { name: name.trim(), description: description.trim(), permissions: [...selected] };
      if (role) await updateRole(role.id, input);
      else await createRole(input);
      toast('success', role ? 'Rôle mis à jour.' : `Rôle « ${input.name} » créé.`);
      onSaved();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Enregistrement impossible.');
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Text variant="subtitle">{role ? `Modifier « ${role.name} »` : 'Nouveau rôle'}</Text>
          {!role && (
            <label className="flex items-center gap-2">
              <span className="font-sans text-[0.8125rem] text-muted-foreground">Partir de</span>
              <select
                className={`${SELECT} w-auto`}
                defaultValue=""
                onChange={(e) => {
                  const base = roles.find((r) => r.id === e.target.value);
                  if (base) setSelected(new Set(base.permissions));
                }}
              >
                <option value="">— rien —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Nom du rôle" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Description"
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            helper="Ce que fait une personne avec ce rôle."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {catalogue.map((group) => (
            <div key={group.area} className="rounded-lg border border-border p-3">
              <Text variant="label" className="mb-2 block">
                {group.area}
              </Text>
              <div className="flex flex-col gap-1.5">
                {group.permissions.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.key)}
                      onChange={() => toggle(p.key)}
                      className="h-4 w-4 cursor-pointer accent-forest-600"
                    />
                    <span className="font-sans text-[0.8125rem]">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected.has('admins.manage') && (
          <Text variant="caption" tone="accent">
            Ce rôle peut ajouter et retirer des administrateurs, et modifier les rôles — c’est le droit le plus étendu.
          </Text>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || name.trim().length < 2 || selected.size === 0}>
            {busy ? 'Enregistrement…' : role ? 'Enregistrer' : 'Créer le rôle'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Area by area: what the role can see, and what it can do there. */
function PermissionSummary({ permissions, catalogue }: { permissions: string[]; catalogue: PermissionGroup[] }) {
  const held = useMemo(() => new Set(permissions), [permissions]);
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {catalogue.map((group) => {
        const has = group.permissions.filter((p) => held.has(p.key));
        const all = has.length === group.permissions.length;
        return (
          <li key={group.area} className={`flex items-start gap-1.5 ${has.length === 0 ? 'opacity-45' : ''}`}>
            {has.length === 0 ? (
              <X size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <Check size={14} className={`mt-0.5 shrink-0 ${all ? 'text-primary' : 'text-mustard-600'}`} />
            )}
            <span className="font-sans text-[0.8125rem]">
              {group.area}
              {has.length > 0 && !all && (
                <span className="text-muted-foreground"> · {has.map((p) => p.label.toLowerCase()).join(', ')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
