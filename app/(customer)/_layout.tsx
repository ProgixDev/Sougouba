import { Redirect, Stack } from 'expo-router';

import { VendorSwitchDialog } from '@/components/customer';
import { useDemoSeed } from '@/hooks/useDemoSeed';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export default function CustomerLayout() {
  const user = useSessionStore((s) => s.user);

  // Runs before the guard's early returns can skip it — hooks must not be
  // conditional. It no-ops for anyone who is not a signed-in customer.
  useDemoSeed();

  // Defense in depth against a stale deep link, or a sign-out that happened
  // while a screen in this group was mounted. Never redirect to `/` here — it
  // would resolve back into this group and loop.
  if (!user) {
    return <Redirect href={routes.onboarding} />;
  }
  if (user.role !== 'customer') {
    return <Redirect href={user.role === 'business' ? routes.businessDashboard : routes.roleSelect} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Mounted once for the whole group: add-to-cart lives on Home, Vendor and
          Product Detail, and all three need the single-vendor confirmation. */}
      <VendorSwitchDialog />
    </>
  );
}
