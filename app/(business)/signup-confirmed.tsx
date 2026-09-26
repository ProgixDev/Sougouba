import { router } from 'expo-router';

import { ApplicationSubmitted } from '@/components/onboarding';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

/**
 * Fin du parcours d'inscription boutique.
 *
 * `router.replace` rather than `push` from the form, and the CTA replaces
 * again: the registration stack must not be reachable behind this screen — a
 * merchant who steps back into a filled-in form and re-submits creates a second
 * pending shop for the same account.
 *
 * The tabs behind it render `PendingApproval` on their own (`useOwnerVendor`
 * re-reads on focus), so this screen only has to say what happened.
 */
export default function ShopSignupConfirmedScreen() {
  const t = useT();
  return (
    <ApplicationSubmitted
      title={t('business.signup.confirmed')}
      body={t('business.signupConfirmed.body')}
      next={[
        t('business.signupConfirmed.body1'),
        t('business.signupConfirmed.body2'),
        t('business.signupConfirmed.body3'),
      ]}
      ctaLabel={t('business.signupConfirmed.back')}
      onContinue={() => router.replace(routes.businessDashboard)}
    />
  );
}
