'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, type SidebarCounts } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ToastProvider } from '@/components/Toast';
import { getSession, type AdminSession } from '@/lib/auth';
import { listVendors } from '@/lib/api/vendors';
import { listCouriers } from '@/lib/api/couriers';
import { listDisputes } from '@/lib/api/disputes';
import { listCourierIssues } from '@/lib/api/courierIssues';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [counts, setCounts] = useState<SidebarCounts>({ pendingMerchants: 0, pendingCouriers: 0, openDisputes: 0, openCourierIssues: 0 });
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
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    async function loadCounts() {
      const [vendors, couriers, disputes, issues] = await Promise.all([
        listVendors('pending'),
        listCouriers('pending'),
        listDisputes('open'),
        listCourierIssues('open'),
      ]);
      setCounts({
        pendingMerchants: vendors.length,
        pendingCouriers: couriers.length,
        openDisputes: disputes.length,
        openCourierIssues: issues.length,
      });
    }
    loadCounts();
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
