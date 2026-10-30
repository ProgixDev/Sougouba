/**
 * The two signup flows' step descriptions.
 *
 * `components/business/ShopSignupForm.tsx` carried its own `STEP_TITLES` array —
 * a third copy of these titles that had already drifted ("Documents" against
 * "Documents et validation"). Both now read from here.
 */
export const onboarding = {
  merchant: {
    business: {
      title: 'Votre commerce',
      body: 'Le nom de votre boutique, sa catégorie — épicerie ou restaurant — et sa spécialité.',
    },
    address: {
      title: 'Adresse et livraison',
      body: 'Où vous êtes et le délai que vous annoncez à vos clients. Les frais de livraison sont fixés par Sougouba selon la distance.',
    },
    documents: {
      title: 'Documents et validation',
      body: 'Votre numéro d’entreprise, la personne responsable, et le permis MAPAQ pour un restaurant. Un administrateur valide avant la mise en ligne.',
    },
  },
  courier: {
    identity: {
      title: 'Vous et votre véhicule',
      body: 'Vos coordonnées, votre ville et le moyen avec lequel vous livrez — vélo, moto ou voiture.',
    },
    documents: {
      title: 'Vos documents',
      body: 'Pièce d’identité, permis de conduire si nécessaire, et preuve d’assurance pour un véhicule motorisé.',
    },
    review: {
      title: 'Validation manuelle',
      body: 'Un administrateur Sougouba examine votre dossier. Vous recevez les premières courses une fois approuvé.',
    },
  },
  /** "Étape 2 — Adresse et livraison" */
  onboardingSheet: {
    merchantTitle: 'Inscrire ma boutique',
    courierTitle: 'Livrer avec Sougouba',
    body: 'Trois étapes, directement dans l’application. Un administrateur valide ensuite votre dossier avant la mise en ligne de votre boutique.',
    courierBody:
      'Trois étapes, directement dans l’application. Un administrateur valide ensuite votre dossier avant votre première course.',
  },
  stepOf: 'Étape %{step} — %{title}',

  /**
   * The four intro slides.
   *
   * The `\n` in each title is a hand-tuned break, not decoration: "Les épiceries
   * d'ici," / "enfin réunies" breaks on a comma, at a syntactic seam. Auto-wrap
   * at an arbitrary width produces a ragged two-line title that reads as an
   * accident, and this is the first screen the brand shows anyone.
   *
   * Each language picks its own break points, and is free to use none —
   * `verify-i18n.ts` checks the counts match so a translator cannot silently
   * drop one, and `OnboardingSlide` must not put `numberOfLines` on the title.
   */
  slides: {
    market: {
      title: 'Les épiceries d’ici,\nenfin réunies',
      body: 'Commerces africains et maghrébins, réunis dans une seule application.',
    },
    spices: {
      title: 'Ce qu’on ne trouve\npas ailleurs',
      body: 'Ras el hanout, attiéké, bissap, agneau halal, fonio : les rayons de dix commerces, au complet.',
    },
    table: {
      title: 'Commandez,\nsuivez, recevez',
      body: 'De la préparation à votre porte, chaque étape de votre commande s’affiche en direct.',
    },
    shopping: {
      title: 'Votre panier habituel,\nen deux gestes',
      body: 'Vos favoris et vos commandes passées restent à portée — pas besoin de tout rechercher.',
    },
  },
  skip: 'Passer',
  next: 'Suivant',
  start: 'Commencer',
};
