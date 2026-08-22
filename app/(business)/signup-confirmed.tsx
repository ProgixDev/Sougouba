import { router } from 'expo-router';

import { ApplicationSubmitted } from '@/components/onboarding';
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
  return (
    <ApplicationSubmitted
      title="Demande envoyée"
      body="Votre dossier est parti en validation. Merci — nous revenons vers vous rapidement."
      next={[
        'Un administrateur Sougouba vérifie vos documents, généralement en un jour ouvrable.',
        'Dès la validation, votre boutique apparaît dans l’application et vous pouvez publier votre catalogue.',
        'Tant qu’elle n’est pas validée, votre boutique n’est visible par aucun client.',
      ]}
      ctaLabel="Retour à ma boutique"
      onContinue={() => router.replace(routes.businessDashboard)}
    />
  );
}
