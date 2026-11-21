'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, type SidebarCounts } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ToastProvider } from '@/components/Toast';
import { Text } from '@/components/ui/Text';
import { getCurrentAdmin, type CurrentAdmin } from '@/lib/api/admins';
import { getSession, signOut, type AdminSession } from '@/lib/auth';
import { getQueueCounts } from '@/lib/api/stats';
import { AdminProvider, permissionForPath } from '@/lib/permissions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [me, setMe] = useState<CurrentAdmin | null>(null);
  const reloadMe = useCallback(async () => {
    setMe(await getCurrentAdmin());
  }, []);
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
      // Role and permissions, read once per visit — the API re-checks them on
      // every call anyway, so a role changed mid-session shows up as a refused
      // action, and as the right sidebar on the next load.
      getCurrentAdmin()
        .then((m) => active && setMe(m))
        .catch(async () => {
          // Not (or no longer) an administrator: the session is of no use here.
          await signOut();
          if (active) router.replace('/login');
        });
    });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!session || !me?.permissions.includes('dashboard.view')) return;
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
  }, [session, me, pathname]);

  if (!session || !me) return null;


  const needed = permissionForPath(pathname);
  const allowed = needed === null || me.permissions.includes(needed);

  return (
    <AdminProvider me={me} reload={reloadMe}>
      <ToastProvider>
        <div className="flex h-dvh overflow-hidden bg-background">
          <Sidebar counts={counts} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar session={session} counts={counts} onOpenMenu={() => setMobileNavOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-8">
              {allowed ? (
                children
              ) : (
                // Reached by URL — the sidebar would not have offered it.
                <div className="mx-auto flex max-w-content flex-col gap-2 py-16 text-center">
                  <Text variant="title">Accès restreint</Text>
                  <Text variant="body" tone="muted">
                    Votre rôle ({me.role?.name ?? '—'}) ne donne pas accès à cette section. Demandez-le à un
                    administrateur qui gère les rôles.
                  </Text>
                </div>
              )}
            </main>
          </div>
        </div>
      </ToastProvider>
    </AdminProvider>
  );
}
