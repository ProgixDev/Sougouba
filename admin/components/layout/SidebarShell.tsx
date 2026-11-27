'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { LogOut, Moon, PanelLeftClose, PanelLeftOpen, Sun, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { t } from '@/lib/i18n';
import { LogoMark } from '@/components/layout/LogoMark';

/**
 * The navigation column itself — the dark panel, its rows, its footer — with
 * nothing in it about who is signed in.
 *
 * The back office and the merchant portal are one product seen from two
 * sides, and they should look it. Both render this: `Sidebar` hands it an
 * administrator's sections and permissions, `MerchantSidebar` a shop's. What
 * differs is the list of entries and the account in the footer; what the
 * column looks like is decided here, once.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Something waiting behind this entry — shown as a badge. Zero shows nothing. */
  count: number;
}

/** A group with `boxed` sits on its own lighter block — the day-to-day work. */
export interface NavGroup {
  title: string;
  boxed: boolean;
  items: NavItem[];
}

/** Who is signed in, as the footer shows it. */
export interface SidebarAccount {
  name: string;
  /** The line under the name: a role, or which space this is. */
  caption: string;
  /** Where the name leads. */
  href: string;
  hrefLabel: string;
}

const COLLAPSED_KEY = 'sougouba-admin-sidebar-collapsed';

/**
 * The label beside an icon when the column is collapsed.
 *
 * Fixed to the viewport and portalled to `body` rather than hung off the
 * column: the nav has to scroll when the window is short, and a scrolling
 * container clips anything that pokes out of it.
 */
function Tip({ label, show }: { label: string; show: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const host = marker.current?.parentElement;
    if (!show || !host) return;
    const enter = () => {
      const r = host.getBoundingClientRect();
      setAt({ top: r.top + r.height / 2, left: r.right + 14 });
    };
    const leave = () => setAt(null);
    host.addEventListener('mouseenter', enter);
    host.addEventListener('mouseleave', leave);
    host.addEventListener('focusin', enter);
    host.addEventListener('focusout', leave);
    return () => {
      host.removeEventListener('mouseenter', enter);
      host.removeEventListener('mouseleave', leave);
      host.removeEventListener('focusin', enter);
      host.removeEventListener('focusout', leave);
      setAt(null);
    };
  }, [show]);

  if (!show) return null;
  return (
    <span ref={marker} hidden>
      {at &&
        createPortal(
          <span
            style={{ top: at.top, left: at.left }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-xl bg-[#1F2D27] px-3.5 py-2 font-sans text-[0.8125rem] font-semibold text-white shadow-floating"
          >
            {label}
          </span>,
          document.body
        )}
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
  groups,
  isActive,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    // Scrolls in both states so a short window never pushes the footer out of
    // the panel; the collapsed hover labels are portalled, so nothing clips them.
    <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2 [scrollbar-width:none]">
      {groups.map((group) => (
        <ul
          key={group.title}
          aria-label={group.title}
          className={cn('flex flex-col gap-1.5', group.boxed && 'rounded-2xl bg-white/[0.04] p-1.5 -mx-1.5')}
        >
          {group.items.map((item) => (
            <li key={item.href}>
              <NavRow item={item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
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
function Footer({
  account,
  onSignOut,
  collapsed,
  onNavigate,
}: {
  account: SidebarAccount;
  onSignOut: () => void | Promise<void>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const initials =
    account.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';

  return (
    <div className={cn('flex gap-2.5 px-4 pb-5 pt-3', collapsed ? 'flex-col items-center' : 'items-center')}>
      <Link
        href={account.href}
        onClick={onNavigate}
        aria-label={account.hrefLabel}
        className={cn(ROUND, 'border-forest-500/60 font-sans text-[0.75rem] font-bold text-white')}
      >
        {initials}
        <Tip label={`${account.name} · ${account.caption}`} show={collapsed} />
      </Link>
      {!collapsed && (
        <Link href={account.href} onClick={onNavigate} className="min-w-0 flex-1">
          <span className="block truncate font-sans text-[0.8125rem] font-semibold text-white">{account.name}</span>
          <span className="block truncate font-sans text-[0.75rem] text-white/45">{account.caption}</span>
        </Link>
      )}
      <button
        type="button"
        aria-label={dark ? t('common.theme.toLight') : t('common.theme.toDark')}
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
        <Tip label={dark ? t('common.theme.light') : t('common.theme.dark')} show={collapsed} />
      </button>
      <button type="button" aria-label={t('nav.sidebar.signOut')} onClick={() => void onSignOut()} className={ROUND}>
        <LogOut size={16} />
        <Tip label={t('nav.sidebar.signOut')} show={collapsed} />
      </button>
    </div>
  );
}

/** A dark green-black panel that floats off the page edge, in both themes. */
// i18n-ignore: a class list.
const PANEL = 'flex flex-col bg-[#101A16] text-white shadow-[0_24px_48px_-24px_rgba(10,32,24,0.55)]';

export function SidebarShell({
  groups,
  isActive,
  account,
  onSignOut,
  mobileOpen = false,
  onCloseMobile,
}: {
  groups: NavGroup[];
  isActive: (href: string) => boolean;
  account: SidebarAccount;
  /** Awaited before anything else happens, so the session is really gone when the page changes. */
  onSignOut: () => void | Promise<void>;
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
          {!collapsed && <span className="font-display text-[1.1875rem] font-bold tracking-tight">{t('common.brand')}</span>}
        </div>
        <NavList groups={groups} isActive={isActive} collapsed={collapsed} />
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t('nav.sidebar.expand') : t('nav.sidebar.collapse')}
            className="group relative flex w-full cursor-pointer items-center gap-1.5 text-white/50 hover:text-white"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              {collapsed ? <PanelLeftOpen size={19} strokeWidth={1.8} /> : <PanelLeftClose size={19} strokeWidth={1.8} />}
            </span>
            {!collapsed && <span className="px-3 font-sans text-[0.875rem] font-medium">{t('nav.sidebar.collapse')}</span>}
            <Tip label={t('nav.sidebar.expand')} show={collapsed} />
          </button>
        </div>
        <Footer account={account} onSignOut={onSignOut} collapsed={collapsed} />
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
          aria-label={t('nav.sidebar.navigation')}
          className={cn(
            'absolute inset-y-2 left-2 w-[272px] rounded-[26px] transition-transform duration-200 ease-out',
            PANEL,
            mobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)]'
          )}
        >
          <div className="flex h-[84px] items-center justify-between pl-5 pr-3">
            <div className="flex items-center gap-3">
              <LogoMark size={42} className="ring-white/10" />
              <span className="font-display text-[1.1875rem] font-bold tracking-tight">{t('common.brand')}</span>
            </div>
            <button
              type="button"
              aria-label={t('nav.sidebar.closeNavigation')}
              onClick={onCloseMobile}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <NavList groups={groups} isActive={isActive} collapsed={false} onNavigate={onCloseMobile} />
          <Footer account={account} onSignOut={onSignOut} collapsed={false} onNavigate={onCloseMobile} />
        </aside>
      </div>
    </>
  );
}
