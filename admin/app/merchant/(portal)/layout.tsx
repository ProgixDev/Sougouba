'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MerchantHeader } from '@/components/layout/MerchantHeader';
import { ToastProvider } from '@/components/Toast';
import { getMerchantSession, type MerchantSession } from '@/lib/merchantAuth';

export default function MerchantPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<MerchantSession | null | undefined>(undefined);

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

  if (!session) return null;

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-background">
        <MerchantHeader session={session} />
        <main className="mx-auto max-w-content p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
