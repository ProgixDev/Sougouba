import { router } from 'expo-router';

import { ApplicationSubmitted } from '@/components/onboarding';
import { routes } from '@/lib/routes';

/** Twin of `app/(business)/signup-confirmed.tsx`; see the note there. */
export default function CourierSignupConfirmedScreen() {
  return (
    <ApplicationSubmitted
      title="Dossier envoyé"
      body="Votre candidature de livreur est partie en validation. Merci — nous revenons vers vous rapidement."
      next={[
        'Un administrateur Sougouba vérifie votre permis, votre assurance et vos coordonnées bancaires.',
        'Dès la validation, les courses proches de vous commencent à s’afficher dans Missions.',
        'Tant que le dossier est en attente, vous ne recevez aucune offre.',
      ]}
      ctaLabel="Retour aux missions"
      onContinue={() => router.replace(routes.courierMissions)}
    />
  );
}
