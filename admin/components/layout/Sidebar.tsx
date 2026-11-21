'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Headset,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Sun,
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
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { signOut } from '@/lib/auth';
import { permissionForPath, useAdmin } from '@/lib/permissions';
import { LogoMark } from '@/components/layout/LogoMark';

export interface SidebarCounts {
  pendingMerchants: number;
  pendingCouriers: number;
  openDisputes: number;
  openCourierIssues: number;
  supportWaiting: number;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

/**
 * The navigation, in the order an operator works through it. A group with
 * `boxed` sits on its own lighter block — the day-to-day work — while the
 * overview and the setup pages stand alone.
 */
export const NAV_GROUPS = (counts: SidebarCounts): { title: string; boxed: boolean; items: NavItem[] }[] => [
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

const COLLAPSED_KEY = 'sougouba-admin-sidebar-collapsed';

/** The label beside an icon when the column is collapsed. */
function Tip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null;
  return (
    <span className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#1F2D27] px-3.5 py-2 font-sans text-[0.8125rem] font-semibold text-white opacity-0 shadow-floating transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className="group relative flex items-center gap-1.5"
    >
      <span
        className={cn(
          'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-forest-500 text-white' : 'text-white/50 group-hover:text-white'
        )}
      >
        <Icon size={19} strokeWidth={1.8} />
        {collapsed && item.count > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-terracotta-500 ring-2 ring-[#101A16]" />
        )}
      </span>
      {!collapsed && (
        <span
          className={cn(
            'flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 font-sans text-[0.875rem] transition-colors',
            active ? 'bg-forest-500 font-semibold text-white' : 'font-medium text-white/60 group-hover:text-white'
          )}
        >
          <span className="truncate">{item.label}</span>
          {item.count > 0 && (
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular',
                active ? 'bg-white/25 text-white' : 'bg-terracotta-500 text-white'
              )}
            >
              {item.count}
            </span>
          )}
        </span>
      )}
      <Tip label={item.count > 0 ? `${item.label} · ${item.count}` : item.label} show={collapsed} />
    </Link>
  );
}

function NavList({
  counts,
  collapsed,
  onNavigate,
}: {
  counts: SidebarCounts;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { can } = useAdmin();
  const pathname = usePathname();
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
    // Collapsed, the hover labels hang outside the column, so nothing may clip them.
    <nav className={cn('flex flex-1 flex-col gap-3 px-4 py-2', collapsed ? 'overflow-visible' : 'overflow-y-auto [scrollbar-width:none]')}>
      {groups.map((group) => (
        <ul
          key={group.title}
          aria-label={group.title}
          className={cn('flex flex-col gap-1.5', group.boxed && 'rounded-2xl bg-white/[0.04] p-1.5 -mx-1.5')}
        >
          {group.items.map((item) => (
            <li key={item.href}>
              <NavRow item={item} active={isActivePath(item.href, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}

const ROUND =
  'group relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/10 text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white';

/** Account, theme and sign-out — three round buttons, as in the rest of the column. */
function Footer({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { me } = useAdmin();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const name = me.fullName || 'Administrateur';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <div className={cn('flex gap-2.5 px-4 pb-5 pt-3', collapsed ? 'flex-col items-center' : 'items-center')}>
      <Link href="/account" onClick={onNavigate} aria-label="Mon compte" className={cn(ROUND, 'border-forest-500/60 font-sans text-[0.75rem] font-bold text-white')}>
        {initials}
        <Tip label={`${name} · ${me.role?.name ?? 'Sans rôle'}`} show={collapsed} />
      </Link>
      {!collapsed && (
        <Link href="/account" onClick={onNavigate} className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[0.8125rem] font-semibold text-white">{name}</span>
          <span className="block truncate font-sans text-[0.75rem] text-white/45">{me.role?.name ?? 'Sans rôle'}</span>
        </Link>
      )}
      <button
        type="button"
        aria-label={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
        onClick={() => {
          const next = !dark;
          setDark(next);
          document.documentElement.classList.toggle('dark', next);
          try {
            localStorage.setItem('sougouba-admin-theme', next ? 'dark' : 'light');
          } catch {}
        }}
        className={ROUND}
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
        <Tip label={dark ? 'Thème clair' : 'Thème sombre'} show={collapsed} />
      </button>
      <button
        type="button"
        aria-label="Se déconnecter"
        onClick={async () => {
          // Awaited so the token is actually revoked before we navigate —
          // firing and forgetting can leave a refreshable session behind if
          // the route change tears the request down mid-flight.
          await signOut();
          router.push('/login');
        }}
        className={ROUND}
      >
        <LogOut size={16} />
        <Tip label="Se déconnecter" show={collapsed} />
      </button>
    </div>
  );
}

/** A dark green-black panel that floats off the page edge, in both themes. */
const PANEL = 'flex flex-col bg-[#101A16] text-white shadow-[0_24px_48px_-24px_rgba(10,32,24,0.55)]';

export function Sidebar({
  counts,
  mobileOpen = false,
  onCloseMobile,
}: {
  counts: SidebarCounts;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {}
  }, []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {}
  }

  return (
    <>
      {/* Desktop: a floating column at md+, full or icons only. */}
      <aside
        className={cn(
          'relative z-30 my-3 ml-3 hidden shrink-0 rounded-[26px] transition-[width] duration-200 md:flex',
          PANEL,
          collapsed ? 'w-[80px]' : 'w-[256px]'
        )}
      >
        <div className={cn('flex h-[84px] items-center gap-3', collapsed ? 'justify-center' : 'px-5')}>
          <LogoMark size={42} className="ring-white/10" />
          {!collapsed && <span className="font-display text-[1.1875rem] font-bold tracking-tight">Sougouba</span>}
        </div>
        <NavList counts={counts} collapsed={collapsed} />
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
            className="group relative flex w-full cursor-pointer items-center gap-1.5 text-white/50 hover:text-white"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              {collapsed ? <PanelLeftOpen size={19} strokeWidth={1.8} /> : <PanelLeftClose size={19} strokeWidth={1.8} />}
            </span>
            {!collapsed && <span className="px-3 font-sans text-[0.875rem] font-medium">Réduire le menu</span>}
            <Tip label="Déplier le menu" show={collapsed} />
          </button>
        </div>
        <Footer collapsed={collapsed} />
      </aside>

      {/* Mobile: a slide-in drawer over a backdrop, below md only. */}
      <div className={cn('fixed inset-0 z-40 md:hidden', mobileOpen ? '' : 'pointer-events-none')} aria-hidden={!mobileOpen}>
        <div
          className={cn('absolute inset-0 bg-black/50 transition-opacity duration-200', mobileOpen ? 'opacity-100' : 'opacity-0')}
          onClick={onCloseMobile}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            'absolute inset-y-2 left-2 w-[272px] rounded-[26px] transition-transform duration-200 ease-out',
            PANEL,
            mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)]'
          )}
        >
          <div className="flex h-[84px] items-center justify-between pl-5 pr-3">
            <div className="flex items-center gap-3">
              <LogoMark size={42} className="ring-white/10" />
              <span className="font-display text-[1.1875rem] font-bold tracking-tight">Sougouba</span>
            </div>
            <button
              type="button"
              aria-label="Fermer la navigation"
              onClick={onCloseMobile}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <NavList counts={counts} collapsed={false} onNavigate={onCloseMobile} />
          <Footer collapsed={false} onNavigate={onCloseMobile} />
        </aside>
      </div>
    </>
  );
}
