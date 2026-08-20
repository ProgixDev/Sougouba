import { Redirect, Stack } from 'expo-router';

import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * The livreur side of the platform (CDC addendum v1.1, §04).
 *
 * Mirrors the merchant group: an account with this role but no approved file is
 * not an error, it is step 3 of registration — the tabs render `CourierPending`
 * until an administrator validates the documents.
 */
export default function CourierLayout() {
  const user = useSessionStore((s) => s.user);

  // Defense in depth against a stale deep link, or a sign-out that happened
  // while a screen in this group was mounted. Never redirect to `/` here — it
  // would resolve back into this group and loop.
  if (!user) {
    return <Redirect href={routes.onboarding} />;
  }
  if (user.role !== 'courier') {
    return <Redirect href={user.role ? homeRouteForRole(user.role) : routes.roleSelect} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
