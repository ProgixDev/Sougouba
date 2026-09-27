import { Redirect, Stack } from 'expo-router';

import { CartBar, VendorSwitchDialog } from '@/components/customer';
import { useDemoSeed } from '@/hooks/useDemoSeed';
import { homeRouteForRole, routes } from '@/lib/routes';
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
    // Resolved through the role map rather than a ternary: with three roles a
    // `business ? … : roleSelect` branch sends a livreur back to the gate they
    // already passed.
    return <Redirect href={user.role ? homeRouteForRole(user.role) : routes.roleSelect} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {/* Mounted once for the whole group: add-to-cart lives on Home, Vendor and
          Product Detail, and all three need the single-vendor confirmation. */}
      <VendorSwitchDialog />
      {/* Floats over the browsing screens only — see `cartBarPlacement`. */}
      <CartBar />
    </>
  );
}
