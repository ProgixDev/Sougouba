import { Redirect, Stack } from 'expo-router';

import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export default function BusinessLayout() {
  const user = useSessionStore((s) => s.user);

  // This group used to run `useBusinessDemoSeed`, which silently handed any
  // merchant account without a shop one of the seeded ones. Under the CDC
  // addendum that hid the wrong thing: a shop exists only once an administrator
  // has approved the documents behind it, so an account with no `vendorId` is a
  // request in the queue and the tabs now say so (`PendingApproval`). Since the
  // back-office that would approve it is a later sprint, that screen carries an
  // explicit "simuler l'approbation" action instead — same outcome, but the
  // state the CDC specifies is visible on the way through.

  // Defense in depth against a stale deep link, or a sign-out that happened
  // while a screen in this group was mounted. Never redirect to `/` here — it
  // would resolve back into this group and loop.
  if (!user) {
    return <Redirect href={routes.onboarding} />;
  }
  if (user.role !== 'business') {
    // See the note in the customer guard: three roles need the map, not a ternary.
    return <Redirect href={user.role ? homeRouteForRole(user.role) : routes.roleSelect} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
