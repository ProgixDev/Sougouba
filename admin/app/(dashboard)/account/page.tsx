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
import {
  getMyActivity,
  getPermissionCatalogue,
  permissionAreaLabel,
  permissionLabel,
  roleDescription,
  roleName,
  updateMyName,
  type PermissionGroup,
} from '@/lib/api/admins';
import type { AuditEntry } from '@/lib/api/audit';
import { formatDate, formatDateTime } from '@/lib/format';
import { t, tMaybe } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { usePagedList } from '@/lib/usePagedList';
import { Pagination } from '@/components/data/Pagination';

/** Long enough that a one-time password from "Administrateurs" is not kept by default. */
const MIN_LENGTH = 12;

/** Same wording as the audit page (the `audit` dictionary). */
const ACTION_LABELS: Record<string, string> = {
  'vendor.approve': t('audit.actions.vendor_approve'),
  'vendor.reject': t('audit.actions.vendor_reject'),
  'vendor.suspend': t('audit.actions.vendor_suspend'),
  'courier.approve': t('audit.actions.courier_approve'),
  'courier.reject': t('audit.actions.courier_reject'),
  'courier.suspend': t('audit.actions.courier_suspend'),
  'user.block': t('audit.actions.user_block'),
  'user.unblock': t('audit.actions.user_unblock'),
  'dispute.resolve': t('audit.actions.dispute_resolve'),
  'courier_issue.resolve': t('audit.actions.courier_issue_resolve'),
  'order.refund': t('audit.actions.order_refund'),
  'order.receipt_resend': t('audit.actions.order_receipt_resend'),
  'settings.update': t('audit.actions.settings_update'),
  'specialty.create': t('audit.actions.specialty_create'),
  'specialty.update': t('audit.actions.specialty_update'),
  'support.reply': t('audit.actions.support_reply'),
  'support.resolve': t('audit.actions.support_resolve'),
  'review.moderate': t('audit.actions.review_moderate'),
  'coupon.deactivate': t('audit.actions.coupon_deactivate'),
  'product.hide': t('audit.actions.product_hide'),
  'product.unhide': t('audit.actions.product_unhide'),
  'admin.create': t('audit.actions.admin_create'),
  'admin.revoke': t('audit.actions.admin_revoke'),
  'admin.role_change': t('audit.actions.admin_role_change'),
  'role.create': t('audit.actions.role_create'),
  'role.update': t('audit.actions.role_update'),
  'role.delete': t('audit.actions.role_delete'),
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
            {me.fullName || t('account.header.fallbackName')}
          </Text>
          {me.role && <Badge tone={me.role.slug === 'owner' ? 'secondary' : 'primary'}>{roleName(me.role)}</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Meta icon={Mail} text={me.email ?? '—'} />
          <Meta icon={Star} text={me.memberSince ? t('account.header.memberSince', { date: formatDate(me.memberSince) }) : t('account.header.member')} />
          <Meta icon={Clock} text={me.lastSignInAt ? t('account.header.lastSignIn', { date: formatDateTime(me.lastSignInAt) }) : '—'} />
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
          <Text variant="subtitle">{t('account.role.title', { role: me.role ? roleName(me.role) : '—' })}</Text>
        </div>
        <Text variant="caption" tone="muted">
          {t('account.role.permissionCount', { count: me.permissions.length })}
        </Text>
      </div>
      {me.role?.description && (
        <Text variant="body" tone="muted">
          {roleDescription(me.role)}
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
                    {permissionAreaLabel(group)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {has.length ? has.map(permissionLabel).join(' · ') : t('account.role.noAccess')}
                  </Text>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Text variant="caption" tone="muted">
        {t('account.role.assignedBy')}
      </Text>
    </Card>
  );
}

function Activity() {
  // Newest first, a page at a time from the audit log.
  const list = usePagedList<AuditEntry>(({ offset, limit }) => getMyActivity(offset, limit), 'me', { pageSize: 10 });
  const rows = list.rows;
  const total = list.total;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Text variant="subtitle">{t('account.activity.title')}</Text>
        <Text variant="caption" tone="muted">
          {t('account.activity.total', { count: total })}
        </Text>
      </div>
      {rows === null ? (
        <Skeleton className="h-32" />
      ) : rows.length === 0 ? (
        <Text variant="body" tone="muted">
          {t('account.activity.empty')}
        </Text>
      ) : (
        <ol className="flex flex-col">
          {rows.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
              <div className="min-w-0">
                <Text variant="body" className="font-medium">
                  {ACTION_LABELS[e.action] ?? tMaybe(`audit.actions.${e.action.replace(/\./g, '_')}`, e.action)}
                </Text>
                <Text variant="caption" tone="muted" className="line-clamp-1">
                  {[e.subjectLabel, e.reason ? t('account.activity.quotedReason', { reason: e.reason }) : null].filter(Boolean).join(' · ') || '—'}
                </Text>
              </div>
              <Text variant="caption" tone="muted" className="whitespace-nowrap">
                {formatDateTime(e.createdAt)}
              </Text>
            </li>
          ))}
        </ol>
      )}
      {total > list.pageSize && (
        <div className="-mx-5 -mb-5 mt-3">
          <Pagination page={list.page} pageSize={list.pageSize} total={total} onPage={list.setPage} />
        </div>
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
      toast('success', t('account.info.saved'));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('account.info.saveFailed'));
    }
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <UserRound size={17} className="text-primary" />
          <Text variant="subtitle">{t('account.info.title')}</Text>
        </div>
        <Input label={t('account.info.nameLabel')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} helper={t('account.info.nameHelper')} />
        <Input label={t('account.info.emailLabel')} value={me.email ?? ''} disabled helper={t('account.info.emailHelper')} />
        <Button type="submit" variant="outline" disabled={busy || !changed}>
          {busy ? t('account.saving') : t('common.actions.save')}
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
    if (next.length < MIN_LENGTH) return setError(t('account.password.minLength', { min: MIN_LENGTH }));
    if (next !== confirm) return setError(t('account.password.mismatch'));
    if (next === current) return setError(t('account.password.same'));
    if (!me.email) return setError(t('account.password.noSession'));

    setBusy(true);
    const check = await supabase().auth.signInWithPassword({ email: me.email, password: current });
    if (check.error) {
      setBusy(false);
      return setError(t('account.password.wrongCurrent'));
    }
    const { error: updateError } = await supabase().auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) return setError(t('account.password.changeFailed'));

    setCurrent('');
    setNext('');
    setConfirm('');
    toast('success', t('account.password.changed'));
  }

  return (
    <Card className="p-5">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-primary" />
          <Text variant="subtitle">{t('account.password.title')}</Text>
        </div>
        <Input
          label={t('account.password.current')}
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          helper={t('account.password.currentHelper')}
        />
        <Input
          label={t('account.password.next')}
          type="password"
          required
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          helper={t('account.password.minLength', { min: MIN_LENGTH })}
        />
        <Input
          label={t('account.password.confirm')}
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={error}
        />
        <Button type="submit" disabled={busy || !current || !next || !confirm}>
          {busy ? t('account.saving') : t('account.password.submit')}
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
    if (error) toast('error', t('account.sessions.signOutFailed'));
    else toast('success', t('account.sessions.signedOut'));
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <LogOut size={17} className="text-primary" />
        <Text variant="subtitle">{t('account.sessions.title')}</Text>
      </div>
      <Text variant="body" tone="muted">
        {t('account.sessions.body')}
      </Text>
      <Button variant="outline" onClick={signOutOthers} disabled={busy}>
        {busy ? t('account.sessions.signingOut') : t('account.sessions.signOutOthers')}
      </Button>
      <Link href="/audit" className="font-sans text-[0.75rem] text-muted-foreground hover:text-foreground hover:underline">
        {t('account.sessions.auditLink')}
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
      <Text variant="subtitle">{t('account.appearance.title')}</Text>
      <div className="grid grid-cols-2 gap-2">
        {[
          { dark: false, label: t('account.appearance.light'), icon: Sun },
          { dark: true, label: t('account.appearance.dark'), icon: Moon },
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
