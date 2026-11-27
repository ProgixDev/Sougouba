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
import { signOut } from '@/lib/auth';
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
    title: 'Pilotage',
    boxed: false,
    items: [{ href: '/', label: 'Aperçu', icon: LayoutDashboard, count: 0 }],
  },
  {
    title: 'Activité',
    boxed: true,
    items: [
      { href: '/orders', label: 'Commandes', icon: Package, count: 0 },
      { href: '/merchants', label: 'Commerçants', icon: Store, count: counts.pendingMerchants },
      { href: '/couriers', label: 'Livreurs', icon: Bike, count: counts.pendingCouriers },
      { href: '/users', label: 'Utilisateurs', icon: Users, count: 0 },
      { href: '/payouts', label: 'Virements', icon: Banknote, count: 0 },
    ],
  },
  {
    title: 'À traiter',
    boxed: true,
    items: [
      { href: '/disputes', label: 'Litiges', icon: MessageCircleWarning, count: counts.openDisputes },
      { href: '/courier-issues', label: 'Incidents livreurs', icon: TriangleAlert, count: counts.openCourierIssues },
      { href: '/support', label: 'Support', icon: Headset, count: counts.supportWaiting },
      { href: '/moderation', label: 'Modération', icon: ShieldAlert, count: 0 },
    ],
  },
  {
    title: 'Configuration',
    boxed: false,
    items: [
      { href: '/specialties', label: 'Spécialités', icon: Tags, count: 0 },
      { href: '/admins', label: 'Administrateurs', icon: UserCog, count: 0 },
      { href: '/audit', label: 'Journal d’audit', icon: ScrollText, count: 0 },
      { href: '/settings', label: 'Paramètres', icon: Settings, count: 0 },
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
        name: me.fullName || 'Administrateur',
        caption: me.role?.name ?? 'Sans rôle',
        href: '/account',
        hrefLabel: 'Mon compte',
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
