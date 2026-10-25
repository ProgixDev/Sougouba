import * as Notifications from 'expo-notifications';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { syncPushRegistration, urlOf } from '@/lib/push';
import { routes } from '@/lib/routes';
import { useLanguageStore } from '@/store/useLanguageStore';
import { usePreferencesStore } from '@/store/usePreferencesStore';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Push, wired to the session. Mounted once, in the root layout.
 *
 * 1. **Registration follows the session.** Once an account has a role, this
 *    device is registered for it — and re-registered whenever the shopper flips
 *    a notification switch or changes language, because the server writes the
 *    notification and needs both. Sign-out withdraws it (`useSessionStore`).
 *
 * 2. **A tapped notification opens what it is about.** Including a tap that
 *    launched the app cold: that one is held until the splash film has made its
 *    routing decision, otherwise the splash's redirect lands on top of it and
 *    the shopper sees their home screen instead of their order.
 */
export function usePushNotifications(): void {
  const userId = useSessionStore((s) => s.user?.id);
  const role = useSessionStore((s) => s.user?.role);
  const preferences = usePreferencesStore((s) => s.notifications);
  const locale = useLanguageStore((s) => s.locale);

  useEffect(() => {
    if (!userId || !role) return;
    void syncPushRegistration();
  }, [userId, role, preferences, locale]);

  const response = Notifications.useLastNotificationResponse();
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const url = urlOf(response);
    if (!url) return;
    setPending(url);
    // Consumed once: a remount must not replay the last tap.
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [response]);

  useEffect(() => {
    if (!pending || !role) return;
    // Still on the splash or onboarding: let them finish routing first.
    if (pathname === routes.splash || pathname === routes.onboarding) return;
    setPending(null);
    router.push(pending as Href);
  }, [pending, role, pathname]);
}
