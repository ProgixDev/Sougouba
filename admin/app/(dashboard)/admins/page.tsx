'use client';
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Clock, Copy, KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2, UserCog, UserMinus, UserPlus, Users, X } from 'lucide-react';
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
  permissionAreaLabel,
  permissionLabel,
  revokeAdmin,
  roleDescription,
  roleName,
  setAdminRole,
  updateRole,
  type AdminAccount,
  type AdminRole,
  type PermissionGroup,
} from '@/lib/api/admins';
import { formatDate, formatDateTime } from '@/lib/format';
// `t` is already the name of a tab in the lists below.
import { t as translate, useLocale } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import { KpiCard, KpiGrid, PageHeader } from '@/components/insights/Insights';

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
  useLocale();
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-content rounded-card" />}>
      <Admins />
    </Suspense>
  );
}

function Admins() {
  useLocale();
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
        toast('error', error instanceof Error ? error.message : translate('common.errors.loadFailed'));
      });
  }, [toast]);

  useEffect(load, [load]);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={UserCog}
        title={translate('admins.title')}
        description={translate('admins.description')}
      />

      <KpiGrid>
        <KpiCard loading={admins === null} icon={Users} label={translate('admins.kpis.team')} value={String(admins?.length ?? 0)} hint={translate('admins.kpis.teamHint')} />
        <KpiCard
          loading={roles === null}
          icon={ShieldCheck}
          tone="forest"
          label={translate('admins.kpis.roles')}
          value={String(roles?.length ?? 0)}
          hint={translate('admins.kpis.rolesHint', {
            custom: roles?.filter((r) => !r.isSystem).length ?? 0,
            system: roles?.filter((r) => r.isSystem).length ?? 0,
          })}
        />
        <KpiCard
          loading={admins === null}
          icon={KeyRound}
          tone="mustard"
          label={translate('admins.kpis.canManage')}
          value={String(
            admins?.filter((a) => roles?.find((r) => r.id === a.role?.id)?.permissions.includes('admins.manage')).length ?? 0
          )}
          hint={translate('admins.kpis.canManageHint')}
        />
        <KpiCard
          loading={admins === null}
          icon={Clock}
          tone="neutral"
          label={translate('admins.kpis.neverSignedIn')}
          value={String(admins?.filter((a) => !a.lastSignInAt).length ?? 0)}
          hint={translate('admins.kpis.neverSignedInHint')}
        />
      </KpiGrid>

      <div className="flex max-w-full gap-1.5 self-start overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]">
        {[
          {
            key: 'members',
            label: admins ? translate('admins.tabs.membersCount', { count: admins.length }) : translate('admins.tabs.members'),
            icon: Users,
          },
          {
            key: 'roles',
            label: roles ? translate('admins.tabs.rolesCount', { count: roles.length }) : translate('admins.tabs.roles'),
            icon: ShieldCheck,
          },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => router.replace(`${pathname}?tab=${t.key}`)}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
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
  useLocale();
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
      toast('success', translate('admins.members.roleChanged', { name: admin.fullName, role: updated.role ? roleName(updated.role) : '—' }));
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('admins.members.roleChangeFailed'));
    }
    setBusy(false);
  }

  async function revoke(reason?: string) {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeAdmin(revoking.id, reason);
      toast('success', translate('admins.members.revoked', { name: revoking.fullName }));
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('admins.members.revokeFailed'));
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
              {translate('admins.members.created.title', { email: created.email, role: created.role })}
            </Text>
          </div>
          <Text variant="body">
            {translate('admins.members.created.body')}
          </Text>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-card px-3 py-2 font-mono text-[0.9375rem] tracking-wide">{created.password}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(created.password)
                  .then(() => toast('success', translate('admins.members.created.copied')))
                  .catch(() => toast('error', translate('admins.members.created.copyFailed')))
              }
            >
              <Copy size={14} /> {translate('admins.members.created.copy')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
              {translate('admins.members.created.dismiss')}
            </Button>
          </div>
        </Card>
      )}

      {manage && (
        <Button className="self-start" onClick={() => setDialog('new')}>
          <UserPlus size={15} /> {translate('admins.members.add')}
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
              {[
                translate('admins.members.columns.admin'),
                translate('admins.shared.role'),
                translate('admins.shared.lastSignIn'),
                translate('admins.shared.memberSince'),
                '',
              ].map((h) => (
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
                          {isMe && <Badge tone="primary">{translate('admins.members.you')}</Badge>}
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
                        aria-label={translate('admins.members.roleOf', { name: a.fullName })}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {roleName(r)}
                          </option>
                        ))}
                        <option value={CUSTOM}>{translate('admins.members.customize')}</option>
                      </select>
                    ) : (
                      <Badge tone={a.role?.slug === 'owner' ? 'secondary' : 'neutral'}>{a.role ? roleName(a.role) : '—'}</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Text variant="body" tone="muted">
                      {a.lastSignInAt ? formatDateTime(a.lastSignInAt) : translate('admins.shared.neverSignedIn')}
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
                        <UserMinus size={14} /> {translate('admins.members.revoke')}
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
        title={translate('admins.members.revokeConfirm.title', { name: revoking?.fullName ?? '' })}
        description={translate('admins.members.revokeConfirm.description')}
        confirmLabel={translate('admins.members.revokeConfirm.confirm')}
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
  useLocale();
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
    if (existing) return { id: existing.id, name: roleName(existing) };
    const base = translate('admins.access.customRoleName', { name: fullName.trim() }).slice(0, 40);
    const input = {
      description: translate('admins.access.customRoleDescription', { name: fullName.trim() }),
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
        toast('success', translate('admins.access.updated', { name: admin.fullName, role: role.name }));
        onDone({});
      } else {
        const result = await createAdmin({ email: email.trim(), fullName: fullName.trim(), roleId: role.id });
        onDone({ created: { email: result.admin.email ?? email.trim(), password: result.temporaryPassword, role: role.name } });
      }
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('admins.shared.saveFailed'));
    }
    setBusy(false);
  }

  const canSubmit = selected.size > 0 && (admin !== null || (fullName.trim().length >= 2 && email.trim().length > 0));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={admin ? translate('admins.access.titleFor', { name: admin.fullName }) : translate('admins.access.titleNew')}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} className="my-6 flex w-full max-w-2xl flex-col gap-5 rounded-card bg-card p-6 shadow-xl sm:p-8">
        <Text variant="title">{admin ? translate('admins.access.titleFor', { name: admin.fullName }) : translate('admins.access.titleNew')}</Text>

        {!admin && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label={translate('admins.access.fullName')} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input
              label={translate('admins.access.email')}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helper={translate('admins.access.emailHelper')}
            />
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-sans text-[0.8125rem] font-semibold">{translate('admins.shared.role')}</span>
          <select value={roleId} onChange={(e) => pickRole(e.target.value)} className={SELECT}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.isSystem ? roleName(r) : translate('admins.access.customOption', { name: r.name })}
              </option>
            ))}
            <option value={CUSTOM} disabled={roleId !== CUSTOM}>
              {translate('admins.access.customChoice')}
            </option>
          </select>
          <span className="font-sans text-[0.75rem] text-muted-foreground">
            {roleId === CUSTOM
              ? translate('admins.access.customHint')
              : roles.filter((r) => r.id === roleId).map(roleDescription)[0]}
          </span>
        </label>

        <div className="flex flex-col gap-2.5">
          <Text variant="label">
            {translate('admins.access.modules', { on: modulesOn, total: catalogue.length })}
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
                    <span className="font-sans text-[0.875rem] font-semibold">{permissionAreaLabel(group)}</span>
                  </label>
                  {actions.map((action) => (
                    <label key={action.key} className="ml-6 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(action.key)}
                        onChange={() => toggleAction(group, action.key)}
                        className="h-3.5 w-3.5 cursor-pointer accent-forest-600"
                      />
                      <span className="font-sans text-[0.75rem] text-muted-foreground">{permissionLabel(action)}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          {selected.has('admins.manage') && (
            <Text variant="caption" tone="accent">
              {translate('admins.access.adminsWarning')}
            </Text>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {translate('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            <ShieldCheck size={15} /> {busy ? translate('admins.shared.saving') : admin ? translate('admins.access.save') : translate('admins.access.create')}
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
  useLocale();
  const toast = useToast();
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminRole | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteRole(deleting.id);
      toast('success', translate('admins.roles.deleted', { name: deleting.name }));
      onChanged();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('admins.roles.deleteFailed'));
    }
    setBusy(false);
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {manage && editing === null && (
        <Button className="self-start" onClick={() => setEditing('new')}>
          <Plus size={15} /> {translate('admins.roles.new')}
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
                  <Text variant="subtitle">{roleName(r)}</Text>
                  {r.isSystem ? (
                    <Badge tone="neutral">
                      <Lock size={11} className="mr-1 inline" />
                      {translate('admins.roles.system')}
                    </Badge>
                  ) : (
                    <Badge tone="primary">{translate('admins.roles.custom')}</Badge>
                  )}
                </div>
                <Text variant="caption" tone="muted">
                  {roleDescription(r) || '—'}
                </Text>
              </div>
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                {translate('admins.roles.memberCount', { count: r.adminCount })}
              </Text>
            </div>
            <PermissionSummary permissions={r.permissions} catalogue={catalogue} />
            {manage && !r.isSystem && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Pencil size={14} /> {translate('common.actions.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={r.adminCount > 0}
                  title={r.adminCount > 0 ? translate('admins.roles.deleteBlocked') : undefined}
                  onClick={() => setDeleting(r)}
                >
                  <Trash2 size={14} /> {translate('common.actions.delete')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={translate('admins.roles.deleteConfirm.title', { name: deleting?.name ?? '' })}
        description={translate('admins.roles.deleteConfirm.description')}
        confirmLabel={translate('common.actions.delete')}
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
  useLocale();
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
      toast('success', role ? translate('admins.roles.editor.updated') : translate('admins.roles.editor.created', { name: input.name }));
      onSaved();
    } catch (error) {
      toast('error', error instanceof Error ? error.message : translate('admins.shared.saveFailed'));
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Text variant="subtitle">{role ? translate('admins.roles.editor.editTitle', { name: role.name }) : translate('admins.roles.new')}</Text>
          {!role && (
            <label className="flex items-center gap-2">
              <span className="font-sans text-[0.8125rem] text-muted-foreground">{translate('admins.roles.editor.startFrom')}</span>
              <select
                className={`${SELECT} w-auto`}
                defaultValue=""
                onChange={(e) => {
                  const base = roles.find((r) => r.id === e.target.value);
                  if (base) setSelected(new Set(base.permissions));
                }}
              >
                <option value="">{translate('admins.roles.editor.startFromNothing')}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleName(r)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label={translate('admins.roles.editor.name')} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label={translate('admins.roles.editor.description')}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            helper={translate('admins.roles.editor.descriptionHelper')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {catalogue.map((group) => (
            <div key={group.area} className="rounded-lg border border-border p-3">
              <Text variant="label" className="mb-2 block">
                {permissionAreaLabel(group)}
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
                    <span className="font-sans text-[0.8125rem]">{permissionLabel(p)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected.has('admins.manage') && (
          <Text variant="caption" tone="accent">
            {translate('admins.roles.editor.adminsWarning')}
          </Text>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || name.trim().length < 2 || selected.size === 0}>
            {busy ? translate('admins.shared.saving') : role ? translate('common.actions.save') : translate('admins.roles.editor.create')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {translate('common.actions.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Area by area: what the role can see, and what it can do there. */
function PermissionSummary({ permissions, catalogue }: { permissions: string[]; catalogue: PermissionGroup[] }) {
  useLocale();
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
              {permissionAreaLabel(group)}
              {has.length > 0 && !all && (
                <span className="text-muted-foreground"> · {has.map((p) => permissionLabel(p).toLowerCase()).join(', ')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
