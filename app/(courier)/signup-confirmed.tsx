import { router } from 'expo-router';

import { ApplicationSubmitted } from '@/components/onboarding';
import { useT } from '@/lib/i18n/useT';
import { routes } from '@/lib/routes';

/** Twin of `app/(business)/signup-confirmed.tsx`; see the note there. */
export default function CourierSignupConfirmedScreen() {
  const t = useT();
  return (
    <ApplicationSubmitted
      title={t('courier.signup.confirmed')}
      body={t('courier.signupConfirmed.body')}
      next={[
        t('courier.signupConfirmed.body1'),
        t('courier.signupConfirmed.body2'),
        t('courier.signupConfirmed.body3'),
      ]}
      ctaLabel={t('courier.signupConfirmed.back')}
      onContinue={() => router.replace(routes.courierMissions)}
    />
  );
}
