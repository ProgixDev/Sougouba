'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, type SidebarCounts } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ToastProvider } from '@/components/Toast';
import { getSession, type AdminSession } from '@/lib/auth';
import { getQueueCounts } from '@/lib/api/stats';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [counts, setCounts] = useState<SidebarCounts>({
    pendingMerchants: 0,
    pendingCouriers: 0,
    openDisputes: 0,
    openCourierIssues: 0,
    supportWaiting: 0,
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let active = true;
    getSession().then((s) => {
      if (!active) return;
      if (!s) {
        router.replace('/login');
        return;
      }
      setSession(s);
    });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    // One request, not four. This used to fire `listVendors`/`listCouriers`/
    // `listDisputes`/`listCourierIssues` in parallel and count the arrays —
    // which meant downloading four full lists to render four numbers, and
    // would have under-counted the moment those lists were paginated.
    // `GET /admin/stats` computes all of them server-side.
    getQueueCounts()
      .then((c) => active && setCounts(c))
      // A badge count is decoration; a failure here must not take the whole
      // dashboard shell down with it.
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // Re-fetched on every navigation too, so an approve/resolve action on a detail
    // page is reflected the moment the admin moves elsewhere — the badges are a
    // convenience count, not a live subscription.
  }, [session, pathname]);

  if (session === undefined) return null;
  if (session === null) return null;

  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar counts={counts} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar session={session} onOpenMenu={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
