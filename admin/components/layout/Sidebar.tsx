'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Store,
  Bike,
  Package,
  MessageCircleWarning,
  TriangleAlert,
  Users,
  ScrollText,
  Settings,
  Tags,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Text } from '../ui/Text';

export interface SidebarCounts {
  pendingMerchants: number;
  pendingCouriers: number;
  openDisputes: number;
  openCourierIssues: number;
}

const NAV = (counts: SidebarCounts) => [
  { href: '/', label: 'Aperçu', icon: LayoutDashboard, count: 0 },
  { href: '/merchants', label: 'Commerçants', icon: Store, count: counts.pendingMerchants },
  { href: '/couriers', label: 'Livreurs', icon: Bike, count: counts.pendingCouriers },
  { href: '/orders', label: 'Commandes', icon: Package, count: 0 },
  { href: '/disputes', label: 'Litiges', icon: MessageCircleWarning, count: counts.openDisputes },
  { href: '/courier-issues', label: 'Incidents livreurs', icon: TriangleAlert, count: counts.openCourierIssues },
  { href: '/users', label: 'Utilisateurs', icon: Users, count: 0 },
  { href: '/specialties', label: 'Spécialités', icon: Tags, count: 0 },
  { href: '/audit', label: 'Journal d’audit', icon: ScrollText, count: 0 },
  { href: '/settings', label: 'Paramètres', icon: Settings, count: 0 },
];

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-600 font-display text-[1.05rem] font-bold text-white">
        S
      </div>
      <div>
        <Text variant="subtitle" className="leading-none">
          Sougouba
        </Text>
        <Text variant="caption" tone="muted" className="leading-none">
          Administration
        </Text>
      </div>
    </div>
  );
}

function NavList({ counts, onNavigate }: { counts: SidebarCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="flex flex-col gap-0.5">
        {NAV(counts).map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 font-sans text-[0.875rem] font-medium transition-colors',
                  active ? 'bg-forest-50 text-forest-700 dark:bg-forest-950 dark:text-forest-200' : 'text-foreground hover:bg-muted'
                )}
              >
                <Icon size={18} strokeWidth={2} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.count > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta-600 px-1.5 text-[11px] font-bold text-white">
                    {item.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({
  counts,
  mobileOpen = false,
  onCloseMobile,
}: {
  counts: SidebarCounts;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  return (
    <>
      {/* Desktop: a static column, always present at md+. */}
      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border bg-card md:flex">
        <Brand />
        <NavList counts={counts} />
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
            'absolute inset-y-0 left-0 flex w-[268px] flex-col bg-card shadow-floating transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-border pl-5 pr-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-600 font-display text-[1.05rem] font-bold text-white">
                S
              </div>
              <div>
                <Text variant="subtitle" className="leading-none">
                  Sougouba
                </Text>
                <Text variant="caption" tone="muted" className="leading-none">
                  Administration
                </Text>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fermer la navigation"
              onClick={onCloseMobile}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
          <NavList counts={counts} onNavigate={onCloseMobile} />
        </aside>
      </div>
    </>
  );
}
