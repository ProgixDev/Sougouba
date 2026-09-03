'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, MapPin, Star } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/data/Skeleton';
import { getUser } from '@/lib/api/users';
import { formatDate } from '@/lib/format';
import type { AdminUserDetail } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = { customer: 'Client', business: 'Commerçant', courier: 'Livreur', admin: 'Administrateur' };

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUserDetail | null | undefined>(undefined);

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
        <Text variant="title">Utilisateur introuvable</Text>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Utilisateurs', href: '/users' }, { label: user.fullName }]} />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 font-display text-[1.1rem] font-bold text-forest-700 dark:bg-forest-900 dark:text-forest-200">
          {user.fullName.slice(0, 1)}
        </div>
        <div>
          <Text as="h1" variant="title">
            {user.fullName}
          </Text>
          {user.role && <Badge tone={user.role === 'business' ? 'secondary' : user.role === 'courier' ? 'primary' : 'neutral'}>{ROLE_LABELS[user.role]}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            Coordonnées
          </Text>
          <dl className="flex flex-col gap-4">
            <Field label="Courriel" value={user.email ?? '—'} icon={Mail} />
            {user.memberSince && <Field label="Membre depuis" value={formatDate(user.memberSince)} icon={Star} />}
          </dl>
        </Card>

        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            Rattachement
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
              <Field label="Adresses enregistrées" value={String(user.addresses.length)} icon={MapPin} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  return (
    <div className="flex gap-2.5">
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
