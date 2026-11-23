'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EyeOff, Package, Search, ShieldAlert, Star, TicketPercent } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { DataTable, type Column } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import {
  deactivateCoupon,
  hideProduct,
  listCoupons,
  listProducts,
  listReviews,
  moderateReview,
  unhideProduct,
  type AdminCoupon,
  type AdminProduct,
  type AdminReview,
  type ReviewAction,
  type ReviewFilter,
} from '@/lib/api/moderation';
import { KpiCard, KpiGrid, PageHeader } from '@/components/insights/Insights';
import { getModerationInsights, type ModerationInsights } from '@/lib/api/insights';
import { formatCad, formatDate, formatDateTime } from '@/lib/format';
import { useAdmin } from '@/lib/permissions';
import type { Page } from '@/lib/api/client';
import { usePagedList } from '@/lib/usePagedList';
import { Pagination } from '@/components/data/Pagination';


const TABS = [
  { key: 'reviews', label: 'Avis', icon: Star },
  { key: 'coupons', label: 'Codes promo', icon: TicketPercent },
  { key: 'products', label: 'Produits', icon: Package },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** A reason, asked for in a dialog, before an action that needs one. */
interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  requireReason: boolean;
  run: (reason?: string) => Promise<void>;
}

/**
 * What merchants and customers write, and the back office's say over it:
 * review comments (hide the words, or remove a fake review from the
 * averages), merchants' promo codes (end an abusive one), and products (hide
 * one from every shopper read). Every action is in the audit log.
 */
export default function ModerationPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-content rounded-card" />}>
      <Moderation />
    </Suspense>
  );
}

function Moderation() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as TabKey) : 'reviews';
  const toast = useToast();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [insights, setInsights] = useState<ModerationInsights | null>(null);

  useEffect(() => {
    getModerationInsights()
      .then(setInsights)
      .catch(() => undefined);
  }, []);

  async function confirm(reason?: string) {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run(reason);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Action impossible.');
    }
    setBusy(false);
    setPending(null);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={ShieldAlert}
        title="Modération"
        description="Avis des clients, codes promo des commerçants et fiches produits. Chaque décision est inscrite au journal d’audit."
      />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Star}
          label="Avis publiés"
          value={String(insights?.reviews ?? 0)}
          hint={insights?.avgReview ? `Note moyenne ${insights.avgReview.toLocaleString('fr-CA')} / 5` : 'Pas encore d’avis'}
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label="Avis à 2 étoiles ou moins · 30 j"
          value={String(insights?.lowReviews30 ?? 0)}
          hint={`${insights?.commentsHidden ?? 0} commentaires masqués · ${insights?.reviewsRemoved ?? 0} avis retirés`}
        />
        <KpiCard
          loading={!insights}
          icon={TicketPercent}
          tone="mustard"
          label="Codes promo actifs"
          value={String(insights?.couponsActive ?? 0)}
          hint={`${insights?.couponUses ?? 0} utilisations au total`}
        />
        <KpiCard
          loading={!insights}
          icon={Package}
          tone="neutral"
          label="Produits masqués"
          value={String(insights?.productsHidden ?? 0)}
          hint={`sur ${insights?.products ?? 0} produits au catalogue`}
        />
      </KpiGrid>

      <div className="flex max-w-full gap-1.5 self-start overflow-x-auto rounded-full border border-border bg-card p-1 [scrollbar-width:none]">
        {TABS.map((t) => (
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

      {tab === 'reviews' && <ReviewsTab ask={setPending} />}
      {tab === 'coupons' && <CouponsTab ask={setPending} />}
      {tab === 'products' && <ProductsTab ask={setPending} />}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel={pending?.confirmLabel ?? ''}
        tone="destructive"
        requireReason={pending?.requireReason}
        reasonLabel="Motif"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

/** A database-paginated list that goes back to page 1 when its key (the filters) changes. */
function usePaged<T>(key: string, fetchPage: (offset: number, limit: number) => Promise<Page<T>>) {
  const toast = useToast();
  const list = usePagedList<T>(({ offset, limit }) => fetchPage(offset, limit), key);
  useEffect(() => {
    if (list.error) toast('error', list.error);
  }, [list.error, toast]);
  return list;
}

/** The pagination props a `DataTable` takes, from a `usePaged` list. */
function serverOf<T>(list: ReturnType<typeof usePagedList<T>>) {
  return {
    page: list.page,
    pageSize: list.pageSize,
    total: list.total,
    onPage: list.setPage,
    onPageSize: list.setPageSize,
    sort: list.sort,
    onSort: list.setSort,
  };
}

function Chips<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`cursor-pointer rounded-full border px-3 py-1 font-sans text-[0.75rem] font-semibold transition-colors ${
            value === o.key ? 'border-forest-600 bg-forest-600/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
      <Search size={15} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent font-sans sm:w-56 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

/** Debounced — each keystroke would otherwise be a request against the /admin budget. */
function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

// ── reviews ─────────────────────────────────────────────────────────────────

const REVIEW_FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'with_comment', label: 'Avec commentaire' },
  { key: 'low', label: '2 étoiles ou moins' },
  { key: 'hidden', label: 'Commentaire masqué' },
  { key: 'removed', label: 'Retirés' },
];

function ReviewsTab({ ask }: { ask: (a: PendingAction) => void }) {
  const toast = useToast();
  const canAct = useAdmin().can('moderation.act');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const list = usePaged<AdminReview>(filter, (offset, limit) =>
    listReviews(filter, offset, limit)
  );
  const { rows, reload } = list;

  function act(review: AdminReview, action: ReviewAction) {
    const run = async (reason?: string) => {
      await moderateReview(review.orderId, action, reason);
      toast('success', 'Avis mis à jour.');
      reload();
    };
    if (action === 'hide_comment') {
      ask({
        title: 'Masquer ce commentaire ?',
        description: 'Le commerçant ne verra plus le texte. La note reste comptée dans la moyenne. Précisez le motif.',
        confirmLabel: 'Masquer',
        requireReason: true,
        run,
      });
    } else if (action === 'remove') {
      ask({
        title: 'Retirer cet avis ?',
        description:
          'L’avis ne compte plus dans la note du commerce ni du livreur, qui sont recalculées, et le commerçant ne le voit plus. Précisez le motif.',
        confirmLabel: 'Retirer',
        requireReason: true,
        run,
      });
    } else {
      void run().catch((error: unknown) => toast('error', error instanceof Error ? error.message : 'Action impossible.'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Chips value={filter} options={REVIEW_FILTERS} onChange={setFilter} />
      {rows === null ? (
        <Skeleton className="h-64 rounded-card" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Star} title="Aucun avis" description="Aucun avis ne correspond à ce filtre." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.orderId} className={`flex flex-col gap-3 p-5 ${r.removedAt ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Text variant="body" className="font-semibold">
                    {r.vendor?.name ?? '—'} · {r.vendorRating}/5
                    {r.courierRating !== null ? ` · livreur ${r.courierRating}/5` : ''}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {r.customerName ?? 'Client'} · {formatDateTime(r.createdAt)} ·{' '}
                    <Link href={`/orders/${r.orderId}`} className="text-primary hover:underline">
                      commande #{r.orderId.slice(0, 8)}
                    </Link>
                  </Text>
                </div>
                <div className="flex gap-2">
                  {r.removedAt && <Badge tone="destructive">Retiré</Badge>}
                  {r.commentHiddenAt && <Badge tone="warning">Commentaire masqué</Badge>}
                </div>
              </div>

              {r.comment ? (
                <Text variant="body" className={r.commentHiddenAt ? 'text-muted-foreground line-through' : ''}>
                  « {r.comment} »
                </Text>
              ) : (
                <Text variant="caption" tone="muted">
                  Sans commentaire
                </Text>
              )}
              {r.moderationReason && (
                <Text variant="caption" tone="muted">
                  Motif : {r.moderationReason}
                </Text>
              )}

              {canAct && (
              <div className="flex flex-wrap gap-2">
                {r.comment &&
                  (r.commentHiddenAt ? (
                    <Button size="sm" variant="ghost" onClick={() => act(r, 'show_comment')}>
                      Réafficher le commentaire
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => act(r, 'hide_comment')}>
                      <EyeOff size={14} /> Masquer le commentaire
                    </Button>
                  ))}
                {r.removedAt ? (
                  <Button size="sm" variant="outline" onClick={() => act(r, 'restore')}>
                    Rétablir l’avis
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => act(r, 'remove')}>
                    Retirer l’avis
                  </Button>
                )}
              </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {rows && rows.length > 0 && (
        <Card>
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />
        </Card>
      )}
    </div>
  );
}

// ── coupons ─────────────────────────────────────────────────────────────────

const COUPON_STATUS: { key: 'all' | 'active' | 'ended'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'En cours' },
  { key: 'ended', label: 'Terminés' },
];

function CouponsTab({ ask }: { ask: (a: PendingAction) => void }) {
  const toast = useToast();
  const canAct = useAdmin().can('moderation.act');
  const [status, setStatus] = useState<'all' | 'active' | 'ended'>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const list = usePaged<AdminCoupon>(`${status}|${debounced}`, (offset, limit) =>
    listCoupons(status, debounced || undefined, offset, limit)
  );
  const { rows, reload } = list;

  const columns: Column<AdminCoupon>[] = [
    { key: 'code', header: 'Code', render: (c) => <Text variant="body" className="font-semibold tracking-wide">{c.code}</Text> },
    {
      key: 'vendor',
      header: 'Commerce',
      render: (c) =>
        c.vendor ? (
          <Link href={`/merchants/${c.vendor.id}`} className="font-sans text-[0.875rem] text-primary hover:underline">
            {c.vendor.name}
          </Link>
        ) : (
          <Text variant="body" tone="muted">
            Plateforme
          </Text>
        ),
    },
    {
      key: 'value',
      header: 'Remise',
      render: (c) => <Text variant="body">{c.discountType === 'percentage' ? `${c.discountValue} %` : formatCad(c.discountValue)}</Text>,
    },
    {
      key: 'used',
      header: 'Utilisations',
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.usedCount}
          {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
        </Text>
      ),
    },
    {
      key: 'ends',
      header: 'Fin',
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.endsAt ? formatDate(c.endsAt) : 'Sans fin'}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (c) => (c.active ? <Badge tone="success">Actif</Badge> : <Badge tone="neutral">Terminé</Badge>),
    },
    {
      key: 'action',
      header: '',
      render: (c) =>
        c.active && canAct ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              ask({
                title: `Désactiver le code ${c.code} ?`,
                description: 'Le code ne pourra plus être utilisé au paiement. Le commerçant le verra comme terminé. Précisez le motif.',
                confirmLabel: 'Désactiver',
                requireReason: true,
                run: async (reason) => {
                  await deactivateCoupon(c.id, reason ?? '');
                  toast('success', `Code ${c.code} désactivé.`);
                  reload();
                },
              });
            }}
          >
            Désactiver
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips value={status} options={COUPON_STATUS} onChange={setStatus} />
        <SearchBox value={search} onChange={setSearch} placeholder="Rechercher un code…" />
      </div>
      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          server={serverOf(list)}
          keyField={(c) => c.id}
          loading={rows === null}
          emptyIcon={TicketPercent}
          emptyTitle="Aucun code promo"
          emptyDescription="Aucun code ne correspond à ce filtre."
        />
      </Card>
    </div>
  );
}

// ── products ────────────────────────────────────────────────────────────────

function ProductsTab({ ask }: { ask: (a: PendingAction) => void }) {
  const toast = useToast();
  const canAct = useAdmin().can('moderation.act');
  const [hiddenOnly, setHiddenOnly] = useState<'all' | 'only'>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const list = usePaged<AdminProduct>(`${hiddenOnly}|${debounced}`, (offset, limit) =>
    listProducts(hiddenOnly, debounced || undefined, offset, limit)
  );
  const { rows, reload } = list;

  const columns: Column<AdminProduct>[] = [
    {
      key: 'name',
      header: 'Produit',
      render: (p) => (
        <div>
          <Text variant="body" className="font-semibold">
            {p.name}
          </Text>
          {p.hiddenReason && (
            <Text variant="caption" tone="muted">
              Motif : {p.hiddenReason}
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Commerce',
      render: (p) =>
        p.vendor ? (
          <Link href={`/merchants/${p.vendor.id}`} className="font-sans text-[0.875rem] text-primary hover:underline">
            {p.vendor.name}
          </Link>
        ) : (
          <Text variant="body">—</Text>
        ),
    },
    { key: 'price', header: 'Prix', render: (p) => <Text variant="body">{formatCad(p.priceCad)}</Text> },
    {
      key: 'status',
      header: 'Statut',
      render: (p) =>
        p.hiddenAt ? (
          <Badge tone="destructive">Masqué</Badge>
        ) : p.isAvailable ? (
          <Badge tone="success">Visible</Badge>
        ) : (
          <Badge tone="neutral">Hors vente</Badge>
        ),
    },
    {
      key: 'action',
      header: '',
      render: (p) =>
        !canAct ? null : p.hiddenAt ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await unhideProduct(p.id);
                toast('success', `« ${p.name} » est de nouveau visible.`);
                reload();
              } catch (error) {
                toast('error', error instanceof Error ? error.message : 'Action impossible.');
              }
            }}
          >
            Réafficher
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              ask({
                title: `Masquer « ${p.name} » ?`,
                description:
                  'Le produit disparaît du catalogue, de la recherche, des paniers et du paiement. Le commerçant le voit marqué « Masqué par Sougouba », avec le motif.',
                confirmLabel: 'Masquer',
                requireReason: true,
                run: async (reason) => {
                  await hideProduct(p.id, reason ?? '');
                  toast('success', `« ${p.name} » est masqué.`);
                  reload();
                },
              });
            }}
          >
            Masquer
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips
          value={hiddenOnly}
          options={[
            { key: 'all', label: 'Tous' },
            { key: 'only', label: 'Masqués' },
          ]}
          onChange={setHiddenOnly}
        />
        <SearchBox value={search} onChange={setSearch} placeholder="Rechercher un produit…" />
      </div>
      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          server={serverOf(list)}
          keyField={(p) => p.id}
          loading={rows === null}
          emptyIcon={Package}
          emptyTitle="Aucun produit"
          emptyDescription="Aucun produit ne correspond à cette recherche."
        />
      </Card>
    </div>
  );
}
