'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Banknote, LayoutDashboard, Package, ShoppingBasket, Store, TicketPercent } from 'lucide-react';
import { StatusBadge } from '@/components/data/StatusBadge';
import { SidebarShell, type NavGroup } from '@/components/layout/SidebarShell';
import { QueueBell, TopbarShell } from '@/components/layout/Topbar';
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
    title: 'Pilotage',
    boxed: false,
    items: [{ href: '/merchant', label: 'Aperçu', icon: LayoutDashboard, count: 0 }],
  },
  {
    title: 'Activité',
    boxed: true,
    items: [
      { href: '/merchant/orders', label: 'Commandes', icon: Package, count: counts.ordersToConfirm },
      { href: '/merchant/products', label: 'Produits', icon: ShoppingBasket, count: 0 },
      { href: '/merchant/coupons', label: 'Codes promo', icon: TicketPercent, count: 0 },
      { href: '/merchant/statements', label: 'Versements', icon: Banknote, count: 0 },
    ],
  },
  {
    title: 'Configuration',
    boxed: false,
    items: [{ href: '/merchant/shop', label: 'Boutique', icon: Store, count: 0 }],
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
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SidebarShell
      groups={MERCHANT_NAV(counts)}
      isActive={(href) => isMerchantPath(href, pathname)}
      account={{ name: session.vendorName, caption: 'Commerçant', href: '/merchant/shop', hrefLabel: 'Ma boutique' }}
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
const STATUS: Partial<Record<MerchantSession['vendorStatus'], { label: string; tone: 'warning' | 'destructive' }>> = {
  pending: { label: 'En cours de vérification', tone: 'warning' },
  suspended: { label: 'Boutique suspendue', tone: 'destructive' },
  rejected: { label: 'Demande non retenue', tone: 'destructive' },
};

export function MerchantTopbar({
  session,
  counts,
  onOpenMenu,
}: {
  session: MerchantSession;
  counts: MerchantCounts;
  onOpenMenu?: () => void;
}) {
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
        pendingText="Des commandes attendent votre confirmation"
        emptyText="Rien ne vous attend pour le moment."
      />
    </TopbarShell>
  );
}
