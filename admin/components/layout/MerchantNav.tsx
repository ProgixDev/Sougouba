'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Banknote, LayoutDashboard, Package, ShoppingBasket, Store, TicketPercent } from 'lucide-react';
import { StatusBadge } from '@/components/data/StatusBadge';
import { SidebarShell, type NavGroup } from '@/components/layout/SidebarShell';
import { QueueBell, TopbarShell } from '@/components/layout/Topbar';
import { t, lazy, useLocale } from '@/lib/i18n';
import { merchantSignOut, type MerchantSession } from '@/lib/merchantAuth';

/**
 * The merchant portal's navigation — the same column and the same bar as the
 * back office (`SidebarShell`, `TopbarShell`), filled with a shop's sections.
 * One product, seen from the shop's side.
 */

export interface MerchantCounts {
  /** Orders placed and not yet accepted by the shop — the only thing here that waits on the merchant. */
  ordersToConfirm: number;
}

/** In the order a shop's day runs: the overview, the work, then the setup. */
export const MERCHANT_NAV = (counts: MerchantCounts): NavGroup[] => [
  {
    title: t('nav.groups.steering'),
    boxed: false,
    items: [{ href: '/merchant', label: t('nav.merchant.overview'), icon: LayoutDashboard, count: 0 }],
  },
  {
    title: t('nav.groups.activity'),
    boxed: true,
    items: [
      { href: '/merchant/orders', label: t('nav.merchant.orders'), icon: Package, count: counts.ordersToConfirm },
      { href: '/merchant/products', label: t('nav.merchant.products'), icon: ShoppingBasket, count: 0 },
      { href: '/merchant/coupons', label: t('nav.merchant.coupons'), icon: TicketPercent, count: 0 },
      { href: '/merchant/statements', label: t('nav.merchant.payouts'), icon: Banknote, count: 0 },
    ],
  },
  {
    title: t('nav.groups.setup'),
    boxed: false,
    items: [{ href: '/merchant/shop', label: t('nav.merchant.shop'), icon: Store, count: 0 }],
  },
];

export function isMerchantPath(href: string, pathname: string): boolean {
  return href === '/merchant' ? pathname === '/merchant' : pathname.startsWith(href);
}

export function MerchantSidebar({
  session,
  counts,
  mobileOpen = false,
  onCloseMobile,
}: {
  session: MerchantSession;
  counts: MerchantCounts;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SidebarShell
      groups={MERCHANT_NAV(counts)}
      isActive={(href) => isMerchantPath(href, pathname)}
      account={{ name: session.vendorName, caption: t('nav.merchant.caption'), href: '/merchant/shop', hrefLabel: t('nav.merchant.myShop') }}
      onSignOut={async () => {
        await merchantSignOut();
        router.push('/merchant/login');
      }}
      mobileOpen={mobileOpen}
      onCloseMobile={onCloseMobile}
    />
  );
}

/** A shop that is not taking orders says so on every page, not only on its settings. */
const STATUS: Partial<Record<MerchantSession['vendorStatus'], { label: string; tone: 'warning' | 'destructive' }>> = lazy(() => ({
  pending: { label: t('nav.merchant.statusPending'), tone: 'warning' },
  suspended: { label: t('nav.merchant.statusSuspended'), tone: 'destructive' },
  rejected: { label: t('nav.merchant.statusRejected'), tone: 'destructive' },
}));

export function MerchantTopbar({
  session,
  counts,
  onOpenMenu,
}: {
  session: MerchantSession;
  counts: MerchantCounts;
  onOpenMenu?: () => void;
}) {
  useLocale();
  const pathname = usePathname();
  const groups = MERCHANT_NAV(counts);
  const group = groups.find((g) => g.items.some((i) => isMerchantPath(i.href, pathname)));
  const item = group?.items.find((i) => isMerchantPath(i.href, pathname));
  const status = STATUS[session.vendorStatus];

  return (
    <TopbarShell section={group && item ? { group: group.title, label: item.label } : null} onOpenMenu={onOpenMenu}>
      {status && (
        <Link href="/merchant/shop" className="shrink-0">
          <StatusBadge label={status.label} tone={status.tone} />
        </Link>
      )}
      <QueueBell
        queues={groups.flatMap((g) => g.items).filter((i) => i.count > 0)}
        pendingText={t('nav.merchant.bellPending')}
        emptyText={t('nav.merchant.bellEmpty')}
      />
    </TopbarShell>
  );
}
