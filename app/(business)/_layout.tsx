import { Redirect, Stack } from 'expo-router';

import { useBusinessDemoSeed } from '@/hooks/useBusinessDemoSeed';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export default function BusinessLayout() {
  const user = useSessionStore((s) => s.user);
  // Mounted once for the whole group, mirroring useDemoSeed on the customer
  // side: links a merchant account that has no shop to one of the seeded ones.
  useBusinessDemoSeed();

  // Defense in depth against a stale deep link, or a sign-out that happened
  // while a screen in this group was mounted. Never redirect to `/` here — it
  // would resolve back into this group and loop.
  if (!user) {
    return <Redirect href={routes.onboarding} />;
  }
  if (user.role !== 'business') {
    return <Redirect href={user.role === 'customer' ? routes.customerHome : routes.roleSelect} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
