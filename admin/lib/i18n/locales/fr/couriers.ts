/** The back office's couriers section: the approval queue and directory, and one courier's file. */
export const couriers = {
  list: {
    title: 'Livreurs',
    description: 'File d’approbation, annuaire et activité de la flotte.',
    /** The tabs above the table. */
    statuses: {
      pending: 'En attente',
      approved: 'Approuvés',
      suspended: 'Suspendus',
      rejected: 'Refusés',
    },
    columns: {
      courier: 'Livreur',
      vehicle: 'Véhicule',
      city: 'Ville',
      joined: 'Inscrit',
      status: 'Statut',
    },
    kpi: {
      online: 'En ligne maintenant',
      onlineHint: { one: 'sur {count} livreur approuvé', other: 'sur {count} livreurs approuvés' },
      deliveries: 'Livraisons · 30 j',
      deliveriesHint: '{amount} gagnés, pourboires compris',
      deliveryTime: 'Durée moyenne de livraison',
      deliveryTimeHint: 'De la récupération à la remise, 30 jours',
      rating: 'Note moyenne',
      ratingHint: { one: '{count} dossier en attente', other: '{count} dossiers en attente' },
    },
    byDay: {
      title: 'Livraisons par jour',
      subtitle: '14 derniers jours',
    },
    fleet: {
      title: 'Flotte',
      subtitle: 'Livreurs approuvés par véhicule',
    },
    top: {
      title: 'Plus actifs · 30 j',
      subtitle: 'Livraisons effectuées',
      value: { one: '{count} livraison', other: '{count} livraisons' },
    },
    searchPlaceholder: 'Rechercher un livreur ou une ville…',
    emptyTitle: 'Aucun livreur',
    emptyDescription: 'Aucun livreur ne correspond à ce filtre pour le moment.',
  },
  detail: {
    notFound: 'Livreur introuvable',
    actions: {
      approve: 'Approuver',
      reject: 'Refuser',
      suspend: 'Suspendre',
    },
    toasts: {
      approved: '{name} a été approuvé.',
      rejected: '{name} a été refusé.',
      suspended: '{name} a été suspendu.',
      failed: 'Décision impossible.',
    },
    statusReason: 'Motif du refus / de la suspension',
    file: {
      title: 'Dossier du livreur',
      phone: 'Téléphone',
      vehicle: 'Véhicule',
      licence: 'Numéro de permis',
      insurer: 'Assureur',
      policy: "Police d'assurance",
      expiry: 'Expiration',
      joinedOn: 'Inscrit le',
    },
    details: {
      title: 'Détails',
      area: 'Secteur',
      rating: 'Note',
      deliveries: 'Livraisons effectuées',
    },
    dialog: {
      rejectTitle: 'Refuser ce livreur ?',
      rejectDescription: 'Le livreur ne pourra pas accepter de courses. Précisez le motif — il aide le livreur à corriger son dossier.',
      suspendTitle: 'Suspendre ce livreur ?',
      suspendDescription: 'Le livreur sera retiré immédiatement de la plateforme. Précisez le motif de la suspension.',
    },
  },
};
