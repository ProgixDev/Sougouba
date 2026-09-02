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
    const s = getMerchantSession();
    if (!s) {
      router.replace('/merchant/login');
      return;
    }
    setSession(s);
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
