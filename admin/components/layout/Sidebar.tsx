'use client';
import { usePathname, useRouter } from 'next/navigation';
import {
  Banknote,
  Headset,
  LayoutDashboard,
  Store,
  Bike,
  Package,
  MessageCircleWarning,
  TriangleAlert,
  UserCog,
  Users,
  ScrollText,
  Settings,
  ShieldAlert,
  Tags,
} from 'lucide-react';
import { roleName } from '@/lib/api/admins';
import { signOut } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { permissionForPath, useAdmin } from '@/lib/permissions';
import { SidebarShell, type NavGroup, type NavItem } from '@/components/layout/SidebarShell';

export type { NavItem };

export interface SidebarCounts {
  pendingMerchants: number;
  pendingCouriers: number;
  openDisputes: number;
  openCourierIssues: number;
  supportWaiting: number;
}

/**
 * The navigation, in the order an operator works through it. A group with
 * `boxed` sits on its own lighter block — the day-to-day work — while the
 * overview and the setup pages stand alone.
 */
export const NAV_GROUPS = (counts: SidebarCounts): NavGroup[] => [
  {
    title: t('nav.groups.steering'),
    boxed: false,
    items: [{ href: '/', label: t('nav.admin.overview'), icon: LayoutDashboard, count: 0 }],
  },
  {
    title: t('nav.groups.activity'),
    boxed: true,
    items: [
      { href: '/orders', label: t('nav.admin.orders'), icon: Package, count: 0 },
      { href: '/merchants', label: t('nav.admin.merchants'), icon: Store, count: counts.pendingMerchants },
      { href: '/couriers', label: t('nav.admin.couriers'), icon: Bike, count: counts.pendingCouriers },
      { href: '/users', label: t('nav.admin.users'), icon: Users, count: 0 },
      { href: '/payouts', label: t('nav.admin.payouts'), icon: Banknote, count: 0 },
    ],
  },
  {
    title: t('nav.groups.toHandle'),
    boxed: true,
    items: [
      { href: '/disputes', label: t('nav.admin.disputes'), icon: MessageCircleWarning, count: counts.openDisputes },
      { href: '/courier-issues', label: t('nav.admin.courierIssues'), icon: TriangleAlert, count: counts.openCourierIssues },
      { href: '/support', label: t('nav.admin.support'), icon: Headset, count: counts.supportWaiting },
      { href: '/moderation', label: t('nav.admin.moderation'), icon: ShieldAlert, count: 0 },
    ],
  },
  {
    title: t('nav.groups.setup'),
    boxed: false,
    items: [
      { href: '/specialties', label: t('nav.admin.specialties'), icon: Tags, count: 0 },
      { href: '/admins', label: t('nav.admin.admins'), icon: UserCog, count: 0 },
      { href: '/audit', label: t('nav.admin.audit'), icon: ScrollText, count: 0 },
      { href: '/settings', label: t('nav.admin.settings'), icon: Settings, count: 0 },
    ],
  },
];

export function isActivePath(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * The back office's navigation: the shared column (`SidebarShell`), filled
 * with the sections this administrator's role can open.
 */
export function Sidebar({
  counts,
  mobileOpen = false,
  onCloseMobile,
}: {
  counts: SidebarCounts;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { can, me } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();

  // Only what this administrator's role can open — see `lib/permissions`.
  const groups = NAV_GROUPS(counts)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        const needed = permissionForPath(item.href);
        return needed === null || can(needed);
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <SidebarShell
      groups={groups}
      isActive={(href) => isActivePath(href, pathname)}
      account={{
        name: me.fullName || t('nav.admin.administrator'),
        caption: me.role ? roleName(me.role) : t('nav.admin.noRole'),
        href: '/account',
        hrefLabel: t('nav.admin.myAccount'),
      }}
      onSignOut={async () => {
        // Awaited so the token is actually revoked before we navigate —
        // firing and forgetting can leave a refreshable session behind if
        // the route change tears the request down mid-flight.
        await signOut();
        router.push('/login');
      }}
      mobileOpen={mobileOpen}
      onCloseMobile={onCloseMobile}
    />
  );
}
