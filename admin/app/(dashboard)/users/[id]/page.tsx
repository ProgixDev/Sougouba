'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Ban, Mail, MapPin, ShieldCheck, Star } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/insights/Insights';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { blockUser, getUser, unblockUser } from '@/lib/api/users';
import { formatDate } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import type { AdminUserDetail } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

const ROLE_LABELS: Record<string, string> = lazy(() => ({
  customer: t('users.roles.customer'),
  business: t('users.roles.business'),
  courier: t('users.roles.courier'),
  admin: t('users.roles.admin'),
}));

export default function UserDetailPage() {
  useLocale();
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const toast = useToast();
  const [user, setUser] = useState<AdminUserDetail | null | undefined>(undefined);
  const [dialog, setDialog] = useState<'block' | 'unblock' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getUser(id)
      .then((u) => active && setUser(u))
      // Null renders "introuvable"; without this a failed request leaves the
      // skeleton spinning.
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, [id]);

  if (user === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (user === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">{t('users.detail.notFound')}</Text>
      </div>
    );
  }

  // Auth's own ban (`banned_until`), set by "Bloquer" — absent or past means active.
  const blocked = Boolean(user.auth.bannedUntil && Date.parse(user.auth.bannedUntil) > Date.now());

  async function handleBlock(reason?: string) {
    const blocking = dialog === 'block';
    setBusy(true);
    try {
      setUser(blocking ? await blockUser(user!.id, reason ?? '') : await unblockUser(user!.id, reason));
      toast(blocking ? 'info' : 'success', t(blocking ? 'users.detail.toasts.blocked' : 'users.detail.toasts.unblocked', { name: user!.fullName }));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('users.detail.toasts.failed'));
    }
    setBusy(false);
    setDialog(null);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('users.list.title'), href: '/users' }, { label: user.fullName }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.fullName || '?'} src={user.avatarUrl} size={48} />
          <div>
            <Text as="h1" variant="title">
              {user.fullName}
            </Text>
            <div className="flex flex-wrap gap-2">
              {user.role && <Badge tone={user.role === 'business' ? 'secondary' : user.role === 'courier' ? 'primary' : 'neutral'}>{ROLE_LABELS[user.role]}</Badge>}
              {blocked && <Badge tone="destructive">{t('users.detail.blockedBadge')}</Badge>}
            </div>
          </div>
        </div>
        {/* An administrator is not blocked from this dashboard, on purpose — the API refuses it too. */}
        {user.role !== 'admin' &&
          can('users.block') &&
          (blocked ? (
            <Button variant="primary" onClick={() => setDialog('unblock')} disabled={busy}>
              <ShieldCheck size={16} /> {t('users.detail.actions.unblock')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setDialog('block')} disabled={busy}>
              <Ban size={16} /> {t('users.detail.actions.block')}
            </Button>
          ))}
      </div>

      {blocked && (
        <Card elevated={false} className="border-destructive/30 bg-destructive/5 p-4">
          <Text variant="body">
            {t('users.detail.blockedNotice')}
          </Text>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            {t('users.detail.contact.title')}
          </Text>
          <dl className="flex flex-col gap-4">
            <Field label={t('users.fields.email')} value={user.email ?? '—'} icon={Mail} />
            {user.memberSince && <Field label={t('users.fields.memberSince')} value={formatDate(user.memberSince)} icon={Star} />}
          </dl>
        </Card>

        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            {t('users.detail.link.title')}
          </Text>
          {user.vendor ? (
            <Link href={`/merchants/${user.vendor.id}`} className="font-sans text-[0.875rem] font-semibold text-primary hover:underline">
              {user.vendor.name} →
            </Link>
          ) : user.courier ? (
            <Link href={`/couriers/${user.courier.id}`} className="font-sans text-[0.875rem] font-semibold text-primary hover:underline">
              {user.courier.fullName} →
            </Link>
          ) : (
            <div className="flex flex-col gap-4">
              <Field label={t('users.detail.link.savedAddresses')} value={String(user.addresses.length)} icon={MapPin} />
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'block' ? t('users.detail.dialog.blockTitle') : t('users.detail.dialog.unblockTitle')}
        description={
          dialog === 'block'
            ? t('users.detail.dialog.blockDescription')
            : t('users.detail.dialog.unblockDescription')
        }
        confirmLabel={dialog === 'block' ? t('users.detail.actions.block') : t('users.detail.actions.unblock')}
        tone={dialog === 'block' ? 'destructive' : 'primary'}
        requireReason={dialog === 'block'}
        reasonLabel={t('common.confirm.reason')}
        busy={busy}
        onConfirm={handleBlock}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  useLocale();
  return (
    <div className="flex flex-wrap gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="body" className="font-medium">
          {value}
        </Text>
      </div>
    </div>
  );
}
