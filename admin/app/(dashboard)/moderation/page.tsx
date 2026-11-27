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
import { formatCad, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { t as translate } from '@/lib/i18n';
import { useAdmin } from '@/lib/permissions';
import type { Page } from '@/lib/api/client';
import { usePagedList } from '@/lib/usePagedList';
import { Pagination } from '@/components/data/Pagination';


const TABS = [
  { key: 'reviews', label: translate('moderation.tabs.reviews'), icon: Star },
  { key: 'coupons', label: translate('moderation.tabs.coupons'), icon: TicketPercent },
  { key: 'products', label: translate('moderation.tabs.products'), icon: Package },
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
      toast('error', error instanceof Error ? error.message : translate('moderation.actionFailed'));
    }
    setBusy(false);
    setPending(null);
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={ShieldAlert}
        title={translate('moderation.title')}
        description={translate('moderation.description')}
      />

      <KpiGrid>
        <KpiCard
          loading={!insights}
          icon={Star}
          label={translate('moderation.kpi.reviewsPublished')}
          value={String(insights?.reviews ?? 0)}
          hint={insights?.avgReview ? translate('moderation.kpi.averageRating', { rating: formatNumber(insights.avgReview) }) : translate('moderation.kpi.noReviewsYet')}
        />
        <KpiCard
          loading={!insights}
          icon={Star}
          tone="terracotta"
          label={translate('moderation.kpi.lowReviews')}
          value={String(insights?.lowReviews30 ?? 0)}
          hint={`${translate('moderation.kpi.commentsHidden', { count: insights?.commentsHidden ?? 0 })} · ${translate('moderation.kpi.reviewsRemoved', { count: insights?.reviewsRemoved ?? 0 })}`}
        />
        <KpiCard
          loading={!insights}
          icon={TicketPercent}
          tone="mustard"
          label={translate('moderation.kpi.activeCoupons')}
          value={String(insights?.couponsActive ?? 0)}
          hint={translate('moderation.kpi.couponUses', { count: insights?.couponUses ?? 0 })}
        />
        <KpiCard
          loading={!insights}
          icon={Package}
          tone="neutral"
          label={translate('moderation.kpi.hiddenProducts')}
          value={String(insights?.productsHidden ?? 0)}
          hint={translate('moderation.kpi.ofProducts', { count: insights?.products ?? 0 })}
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
        reasonLabel={translate('common.confirm.reason')}
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
  { key: 'all', label: translate('moderation.reviews.filters.all') },
  { key: 'with_comment', label: translate('moderation.reviews.filters.withComment') },
  { key: 'low', label: translate('moderation.reviews.filters.low') },
  { key: 'hidden', label: translate('moderation.reviews.filters.hidden') },
  { key: 'removed', label: translate('moderation.reviews.filters.removed') },
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
      toast('success', translate('moderation.reviews.updated'));
      reload();
    };
    if (action === 'hide_comment') {
      ask({
        title: translate('moderation.reviews.hide.title'),
        description: translate('moderation.reviews.hide.description'),
        confirmLabel: translate('moderation.reviews.hide.confirm'),
        requireReason: true,
        run,
      });
    } else if (action === 'remove') {
      ask({
        title: translate('moderation.reviews.remove.title'),
        description: translate('moderation.reviews.remove.description'),
        confirmLabel: translate('moderation.reviews.remove.confirm'),
        requireReason: true,
        run,
      });
    } else {
      void run().catch((error: unknown) => toast('error', error instanceof Error ? error.message : translate('moderation.actionFailed')));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Chips value={filter} options={REVIEW_FILTERS} onChange={setFilter} />
      {rows === null ? (
        <Skeleton className="h-64 rounded-card" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={Star} title={translate('moderation.reviews.emptyTitle')} description={translate('moderation.reviews.emptyDescription')} />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <Card key={r.orderId} className={`flex flex-col gap-3 p-5 ${r.removedAt ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Text variant="body" className="font-semibold">
                    {r.vendor?.name ?? '—'} · {r.vendorRating}/5
                    {r.courierRating !== null ? ` · ${translate('moderation.reviews.courierRating', { rating: r.courierRating })}` : ''}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {r.customerName ?? translate('moderation.reviews.customerFallback')} · {formatDateTime(r.createdAt)} ·{' '}
                    <Link href={`/orders/${r.orderId}`} className="text-primary hover:underline">
                      {translate('moderation.reviews.orderLink', { id: r.orderId.slice(0, 8) })}
                    </Link>
                  </Text>
                </div>
                <div className="flex gap-2">
                  {r.removedAt && <Badge tone="destructive">{translate('moderation.reviews.removedBadge')}</Badge>}
                  {r.commentHiddenAt && <Badge tone="warning">{translate('moderation.reviews.commentHiddenBadge')}</Badge>}
                </div>
              </div>

              {r.comment ? (
                <Text variant="body" className={r.commentHiddenAt ? 'text-muted-foreground line-through' : ''}>
                  {translate('moderation.reviews.quotedComment', { comment: r.comment })}
                </Text>
              ) : (
                <Text variant="caption" tone="muted">
                  {translate('moderation.reviews.noComment')}
                </Text>
              )}
              {r.moderationReason && (
                <Text variant="caption" tone="muted">
                  {translate('moderation.reasonLine', { reason: r.moderationReason })}
                </Text>
              )}

              {canAct && (
              <div className="flex flex-wrap gap-2">
                {r.comment &&
                  (r.commentHiddenAt ? (
                    <Button size="sm" variant="ghost" onClick={() => act(r, 'show_comment')}>
                      {translate('moderation.reviews.showComment')}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => act(r, 'hide_comment')}>
                      <EyeOff size={14} /> {translate('moderation.reviews.hideComment')}
                    </Button>
                  ))}
                {r.removedAt ? (
                  <Button size="sm" variant="outline" onClick={() => act(r, 'restore')}>
                    {translate('moderation.reviews.restore')}
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => act(r, 'remove')}>
                    {translate('moderation.reviews.removeReview')}
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
  { key: 'all', label: translate('moderation.coupons.filters.all') },
  { key: 'active', label: translate('moderation.coupons.filters.active') },
  { key: 'ended', label: translate('moderation.coupons.filters.ended') },
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
    { key: 'code', header: translate('moderation.coupons.columns.code'), render: (c) => <Text variant="body" className="font-semibold tracking-wide">{c.code}</Text> },
    {
      key: 'vendor',
      header: translate('moderation.coupons.columns.vendor'),
      render: (c) =>
        c.vendor ? (
          <Link href={`/merchants/${c.vendor.id}`} className="font-sans text-[0.875rem] text-primary hover:underline">
            {c.vendor.name}
          </Link>
        ) : (
          <Text variant="body" tone="muted">
            {translate('moderation.coupons.platform')}
          </Text>
        ),
    },
    {
      key: 'value',
      header: translate('moderation.coupons.columns.discount'),
      render: (c) => <Text variant="body">{c.discountType === 'percentage' ? formatNumber(c.discountValue / 100, { style: 'percent', maximumFractionDigits: 2 }) : formatCad(c.discountValue)}</Text>,
    },
    {
      key: 'used',
      header: translate('moderation.coupons.columns.uses'),
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.usedCount}
          {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
        </Text>
      ),
    },
    {
      key: 'ends',
      header: translate('moderation.coupons.columns.ends'),
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.endsAt ? formatDate(c.endsAt) : translate('moderation.coupons.noEnd')}
        </Text>
      ),
    },
    {
      key: 'status',
      header: translate('moderation.coupons.columns.status'),
      render: (c) => (c.active ? <Badge tone="success">{translate('moderation.coupons.active')}</Badge> : <Badge tone="neutral">{translate('moderation.coupons.ended')}</Badge>),
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
                title: translate('moderation.coupons.deactivate.title', { code: c.code }),
                description: translate('moderation.coupons.deactivate.description'),
                confirmLabel: translate('moderation.coupons.deactivate.button'),
                requireReason: true,
                run: async (reason) => {
                  await deactivateCoupon(c.id, reason ?? '');
                  toast('success', translate('moderation.coupons.deactivate.done', { code: c.code }));
                  reload();
                },
              });
            }}
          >
            {translate('moderation.coupons.deactivate.button')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips value={status} options={COUPON_STATUS} onChange={setStatus} />
        <SearchBox value={search} onChange={setSearch} placeholder={translate('moderation.coupons.searchPlaceholder')} />
      </div>
      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          server={serverOf(list)}
          keyField={(c) => c.id}
          loading={rows === null}
          emptyIcon={TicketPercent}
          emptyTitle={translate('moderation.coupons.emptyTitle')}
          emptyDescription={translate('moderation.coupons.emptyDescription')}
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
      header: translate('moderation.products.columns.product'),
      render: (p) => (
        <div>
          <Text variant="body" className="font-semibold">
            {p.name}
          </Text>
          {p.hiddenReason && (
            <Text variant="caption" tone="muted">
              {translate('moderation.reasonLine', { reason: p.hiddenReason })}
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'vendor',
      header: translate('moderation.products.columns.vendor'),
      render: (p) =>
        p.vendor ? (
          <Link href={`/merchants/${p.vendor.id}`} className="font-sans text-[0.875rem] text-primary hover:underline">
            {p.vendor.name}
          </Link>
        ) : (
          <Text variant="body">—</Text>
        ),
    },
    { key: 'price', header: translate('moderation.products.columns.price'), render: (p) => <Text variant="body">{formatCad(p.priceCad)}</Text> },
    {
      key: 'status',
      header: translate('moderation.products.columns.status'),
      render: (p) =>
        p.hiddenAt ? (
          <Badge tone="destructive">{translate('moderation.products.hidden')}</Badge>
        ) : p.isAvailable ? (
          <Badge tone="success">{translate('moderation.products.visible')}</Badge>
        ) : (
          <Badge tone="neutral">{translate('moderation.products.offSale')}</Badge>
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
                toast('success', translate('moderation.products.shownAgain', { name: p.name }));
                reload();
              } catch (error) {
                toast('error', error instanceof Error ? error.message : translate('moderation.actionFailed'));
              }
            }}
          >
            {translate('moderation.products.showAgain')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              ask({
                title: translate('moderation.products.hide.title', { name: p.name }),
                description: translate('moderation.products.hide.description'),
                confirmLabel: translate('moderation.products.hide.button'),
                requireReason: true,
                run: async (reason) => {
                  await hideProduct(p.id, reason ?? '');
                  toast('success', translate('moderation.products.hide.done', { name: p.name }));
                  reload();
                },
              });
            }}
          >
            {translate('moderation.products.hide.button')}
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
            { key: 'all', label: translate('moderation.products.filters.all') },
            { key: 'only', label: translate('moderation.products.filters.hidden') },
          ]}
          onChange={setHiddenOnly}
        />
        <SearchBox value={search} onChange={setSearch} placeholder={translate('moderation.products.searchPlaceholder')} />
      </div>
      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          server={serverOf(list)}
          keyField={(p) => p.id}
          loading={rows === null}
          emptyIcon={Package}
          emptyTitle={translate('moderation.products.emptyTitle')}
          emptyDescription={translate('moderation.products.emptyDescription')}
        />
      </Card>
    </div>
  );
}
