'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MerchantSidebar, MerchantTopbar, type MerchantCounts } from '@/components/layout/MerchantNav';
import { ToastProvider } from '@/components/Toast';
import { listMerchantOrders } from '@/lib/api/merchantOrders';
import { getMerchantSession, type MerchantSession } from '@/lib/merchantAuth';
import { useLocale } from '@/lib/i18n';

/**
 * The merchant portal's frame: the same floating column and top bar as the
 * back office, with a shop's sections in them.
 */
export default function MerchantPortalLayout({ children }: { children: React.ReactNode }) {
  useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<MerchantSession | null | undefined>(undefined);
  const [counts, setCounts] = useState<MerchantCounts>({ ordersToConfirm: 0 });
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
    getMerchantSession()
      .then((s) => {
        if (!active) return;
        if (!s) router.replace('/merchant/login');
        else setSession(s);
      })
      // The API unreachable is not "signed out" — but the portal cannot render
      // anything without it, and the login page says why when it is tried.
      .catch(() => active && router.replace('/merchant/login'));
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    // One row asked for, the total read: how many orders wait for the shop.
    listMerchantOrders({ status: 'pending' }, { offset: 0, limit: 1 })
      .then((page) => active && setCounts({ ordersToConfirm: page.total }))
      // A badge count is decoration; a failure here must not take the portal down with it.
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // Re-read on every navigation, so an order accepted on its page is off the
    // badge the moment the merchant moves on — a convenience count, not a live feed.
  }, [session, pathname]);

  if (!session) return null;

  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <MerchantSidebar session={session} counts={counts} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MerchantTopbar session={session} counts={counts} onOpenMenu={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-8">
            <div className="mx-auto max-w-content">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
