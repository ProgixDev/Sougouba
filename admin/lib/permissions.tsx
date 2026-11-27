'use client';
import { createContext, useContext, useMemo } from 'react';
import type { CurrentAdmin } from './api/admins';
import { useLocale } from './i18n';

/**
 * Which section of the dashboard needs which permission — the sidebar hides
 * what a role cannot open, and the layout refuses a page reached by URL.
 *
 * Courtesy only: the API checks the same permission on every call
 * (`AdminGuard`), so a hidden button that someone forced would still be
 * refused. This file decides what to *show*.
 */
export const SECTION_PERMISSIONS: { prefix: string; permission: string }[] = [
  { prefix: '/merchants', permission: 'vendors.view' },
  { prefix: '/couriers', permission: 'couriers.view' },
  { prefix: '/orders', permission: 'orders.view' },
  { prefix: '/disputes', permission: 'disputes.view' },
  { prefix: '/courier-issues', permission: 'courier_issues.view' },
  { prefix: '/support', permission: 'support.view' },
  { prefix: '/moderation', permission: 'moderation.view' },
  { prefix: '/users', permission: 'users.view' },
  { prefix: '/specialties', permission: 'specialties.view' },
  { prefix: '/payouts', permission: 'payouts.view' },
  { prefix: '/audit', permission: 'audit.view' },
  { prefix: '/admins', permission: 'admins.view' },
  { prefix: '/settings', permission: 'settings.view' },
];

/** The permission a path needs, or null when any administrator may open it (`/account`). */
export function permissionForPath(pathname: string): string | null {
  if (pathname === '/') return 'dashboard.view';
  if (pathname.startsWith('/account')) return null;
  return SECTION_PERMISSIONS.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`))?.permission ?? null;
}

interface AdminContextValue {
  me: CurrentAdmin;
  can: (permission: string) => boolean;
  /** Re-reads the signed-in administrator — after changing your own name, say. */
  reload: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  me,
  reload,
  children,
}: {
  me: CurrentAdmin;
  reload: () => Promise<void>;
  children: React.ReactNode;
}) {
  // Nothing of its own to translate; subscribed like every component, so the rule has no exceptions.
  useLocale();
  // Stable across renders, so pages can list `can` in an effect's dependencies
  // without refetching every time the layout re-renders.
  const value = useMemo(
    () => ({ me, reload, can: (permission: string) => me.permissions.includes(permission) }),
    [me, reload]
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/** The signed-in administrator and `can(permission)`. Only inside the dashboard layout. */
export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error('useAdmin must be used inside the dashboard layout');
  return value;
}
