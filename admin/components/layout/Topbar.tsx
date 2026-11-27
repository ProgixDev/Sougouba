'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, Menu, UserRound } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { NAV_GROUPS, isActivePath, type SidebarCounts } from './Sidebar';
import type { NavItem } from './SidebarShell';
import { permissionForPath, useAdmin } from '@/lib/permissions';
import type { AdminSession } from '@/lib/auth';

/** Where the admin is: the section's group and name, read from the navigation itself. */
function useSection(counts: SidebarCounts) {
  const pathname = usePathname();
  if (pathname.startsWith('/account')) return { group: 'Compte', label: 'Mon compte', icon: UserRound };
  for (const group of NAV_GROUPS(counts)) {
    // Longest match first would only matter for nested routes; none overlap today.
    const item = group.items.find((i) => isActivePath(i.href, pathname));
    if (item) return { group: group.title, label: item.label, icon: item.icon };
  }
  return null;
}

/**
 * What is waiting on someone, behind one bell — each line opens its list.
 *
 * Shared with the merchant portal: the entries are whichever navigation items
 * carry a count, and the two sentences say whose turn it is.
 */
export function QueueBell({
  queues,
  pendingText,
  emptyText,
}: {
  /** Navigation entries with something behind them (`count > 0`). */
  queues: NavItem[];
  pendingText: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const total = queues.reduce((s, q) => s + q.count, 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={total > 0 ? `${total} éléments en attente` : 'Rien en attente'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
      >
        <Bell size={17} strokeWidth={2} />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta-500 px-1 text-[10px] font-bold tabular text-white ring-2 ring-background">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-border bg-card shadow-floating">
          <div className="border-b border-border px-4 py-3">
            <p className="font-sans text-[0.875rem] font-semibold">En attente</p>
            <p className="font-sans text-[0.75rem] text-muted-foreground">
              {total > 0 ? pendingText : emptyText}
            </p>
          </div>
          {queues.length > 0 && (
            <ul className="py-1.5">
              {queues.map((q) => {
                const Icon = q.icon;
                return (
                  <li key={q.href}>
                    <Link href={q.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-950 dark:text-terracotta-200">
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 font-sans text-[0.8125rem] font-medium">{q.label}</span>
                      <span className="font-sans text-[0.8125rem] font-semibold tabular">{q.count}</span>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The bar above every page: the menu button on a phone, where the reader is,
 * and whatever the space puts on the right. Shared with the merchant portal.
 */
export function TopbarShell({
  section,
  onOpenMenu,
  children,
}: {
  /** The current section's group and name, or null on a page outside the navigation. */
  section: { group: string; label: string } | null;
  onOpenMenu?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-4 sm:h-[76px] sm:gap-4 sm:px-5 md:px-8">
      <button
        type="button"
        aria-label="Ouvrir la navigation"
        onClick={onOpenMenu}
        className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-foreground hover:bg-muted md:hidden"
      >
        <Menu size={18} />
      </button>

      {section && (
        <p className="hidden shrink-0 font-sans text-[0.9375rem] font-semibold lg:block">
          <span className="text-muted-foreground">{section.group}</span>
          <span className="mx-2 text-border">/</span>
          {section.label}
        </p>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 sm:ml-auto sm:flex-none">{children}</div>
    </header>
  );
}

export function Topbar({
  counts,
  onOpenMenu,
}: {
  session: AdminSession | null;
  counts: SidebarCounts;
  onOpenMenu?: () => void;
}) {
  const { can } = useAdmin();
  const section = useSection(counts);
  // The queues this administrator's role can open.
  const queues = NAV_GROUPS(counts)
    .flatMap((g) => g.items)
    .filter((i) => i.count > 0)
    .filter((i) => {
      const needed = permissionForPath(i.href);
      return needed === null || can(needed);
    });

  return (
    <TopbarShell section={section} onOpenMenu={onOpenMenu}>
      <GlobalSearch />
      <QueueBell
        queues={queues}
        pendingText="Ce qui attend une décision de l’équipe"
        emptyText="Rien n’attend l’équipe pour le moment."
      />
    </TopbarShell>
  );
}
