import { Redirect, Stack } from 'expo-router';

import { homeRouteForRole, routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  const user = useSessionStore((s) => s.user);

  // A full session already exists — auth screens must never be reachable (deep link, back-nav).
  if (user?.role) {
    return <Redirect href={homeRouteForRole(user.role)} />;
  }
  // Signed up but no role yet. `role-select` lives OUTSIDE this group on purpose:
  // redirecting to a route inside the very stack this guard refuses to render
  // would never mount anything, and would re-fire the redirect on every render.
  if (user) {
    return <Redirect href={routes.roleSelect} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
