/**
 * The merchant portal's shop components (`components/merchant/`): the shop's
 * details, its opening hours, its shelves, its subscription, its payouts, and
 * the form fields they share.
 */
export const portalShop = {
  saving: 'Enregistrement…',
  saveFailed: 'Enregistrement impossible. Veuillez réessayer.',
  /** `ShopInfoCard` — what customers read about the shop. */
  info: {
    title: 'Votre boutique',
    subtitle: 'Ce que les clients voient en ouvrant votre page.',
    cover: 'Photo de couverture',
    coverHelper: 'Une photo large de votre boutique ou de vos produits. JPEG, PNG ou WebP, 8 Mo au maximum.',
    name: 'Nom de la boutique',
    specialty: 'Spécialité',
    specialtyHelper: 'En quelques mots : « Épicerie sénégalaise », « Pâtisserie orientale »…',
    eta: 'Délai de préparation et livraison (min)',
    etaHelper: 'Le délai annoncé aux clients, de 10 à 180 minutes.',
    halal: 'Certifié halal',
    halalHint: 'Affiche le badge halal sur votre boutique.',
    nothingToSave: 'Rien à enregistrer',
    saved: 'Boutique enregistrée',
    errors: {
      name: 'Nom de la boutique requis',
      specialty: 'Entre 3 et 40 caractères',
      eta: 'Entre 10 et 180 minutes',
    },
  },
  /** `ShopHoursCard`. The days' names come from `Intl`, not from here. */
  hours: {
    title: 'Horaires d’ouverture',
    subtitle: 'En dehors de ces heures, votre boutique s’affiche fermée et ne reçoit pas de commandes.',
    copyMonday: 'Copier le lundi sur toute la semaine',
    openSwitch: '{day} : ouvert',
    closed: 'Fermé',
    opening: '{day}, ouverture',
    to: 'à',
    closing: '{day}, fermeture',
    invalid: 'Heures invalides',
    save: 'Enregistrer les horaires',
    saved: 'Horaires enregistrés',
    wrongOrder: 'L’heure de fermeture doit suivre l’heure d’ouverture.',
  },
  /** `ShopSectionsCard` — « rayons » for a grocery, « sections du menu » for a restaurant. */
  sections: {
    shelves: {
      title: 'Rayons',
      intro: 'Les rayons de votre boutique : « Épices », « Boissons », « Surgelés »… Chaque produit est rangé dans un rayon.',
      empty: 'Aucun rayon pour l’instant. Ajoutez-en un pour pouvoir créer des produits.',
      nameLabel: 'Nom du rayon',
      newLabel: 'Nouveau rayon',
      removeBody: 'Seul un rayon vide peut être supprimé. Les produits ne sont jamais supprimés avec lui.',
    },
    menu: {
      title: 'Sections du menu',
      intro: 'Les parties de votre menu : « Entrées », « Plats », « Boissons »… Chaque plat est rangé dans une section.',
      empty: 'Aucune section pour l’instant. Ajoutez-en une pour pouvoir créer des plats.',
      nameLabel: 'Nom de la section',
      newLabel: 'Nouvelle section',
      removeBody: 'Seule une section vide peut être supprimée. Les plats ne sont jamais supprimés avec elle.',
    },
    saveName: 'Enregistrer le nom',
    rename: 'Renommer {name}',
    remove: 'Supprimer {name}',
    removeTitle: 'Supprimer « {name} » ?',
    addFailed: 'Ajout impossible. Veuillez réessayer.',
    renameFailed: 'Modification impossible. Veuillez réessayer.',
    removeFailed: 'Suppression impossible. Veuillez réessayer.',
    notEmpty: 'Il contient encore des produits. Déplacez-les ou supprimez-les d’abord.',
  },
  /** `SubscriptionCard`. */
  subscription: {
    title: 'Abonnement mensuel',
    intro: 'Un montant fixe par mois, en plus de la commission sur chaque vente. Prélevé sur votre carte par Stripe.',
    status: {
      inactive: 'Non abonné',
      active: 'Actif',
      pastDue: 'Paiement en retard',
      canceled: 'Annulé',
    },
    loadFailed: 'Impossible de lire votre abonnement. Rechargez la page.',
    perMonth: 'par mois',
    unavailable: 'Le paiement en ligne de l’abonnement n’est pas encore activé. Vous serez prévenu dès qu’il le sera.',
    opening: 'Ouverture…',
    updateCard: 'Mettre à jour ma carte',
    manage: 'Gérer mon abonnement',
    subscribe: 'S’abonner',
    stripeFailed: 'Ouverture de Stripe impossible. Veuillez réessayer.',
    describe: {
      cancelling: 'Résilié : votre abonnement reste actif jusqu’au {date}.',
      nextCharge: 'Prochain prélèvement le {date}.',
      active: 'Votre abonnement est actif.',
      pastDue: 'Le dernier prélèvement a échoué. Mettez votre carte à jour pour garder votre abonnement.',
      canceled: 'Votre abonnement est terminé. Vous pouvez vous réabonner quand vous voulez.',
      inactive: 'Vous n’êtes pas encore abonné.',
    },
  },
  /** `PayoutsCard`. */
  payouts: {
    title: 'Versements',
    intro: 'Chaque vendredi, pour les commandes livrées : vos produits et leurs taxes, moins la commission et vos codes promo.',
    state: {
      active: {
        label: 'Versements actifs',
        body: 'Stripe dépose votre part des ventes sur votre compte bancaire, chaque vendredi.',
      },
      review: {
        label: 'Vérification en cours',
        body: 'Stripe vérifie vos informations. Vos ventes s’accumulent d’ici là et seront versées ensuite.',
      },
      setup: {
        label: 'Compte bancaire à ajouter',
        body: 'Votre part des ventes reste en attente tant qu’aucun compte n’est relié. Stripe recueille vos coordonnées bancaires — Sougouba ne les voit jamais.',
      },
      unavailable: {
        label: 'Statut indisponible',
        body: 'Impossible de joindre le service de paiement pour le moment. Vos ventes sont bien enregistrées.',
      },
    },
    next: 'prochain versement, le {date}',
    nextWithOrders: {
      one: 'prochain versement, le {date} · {count} commande',
      other: 'prochain versement, le {date} · {count} commandes',
    },
    negative: 'Des remboursements dépassent vos ventes livrées depuis le dernier versement. La différence sera retenue sur les prochains.',
    notOpen: 'Les versements automatiques ne sont pas encore ouverts par Sougouba. Vos ventes sont enregistrées et figurent sur vos relevés.',
    opening: 'Ouverture…',
    setUp: 'Configurer mes versements',
    review: 'Revoir mes informations',
    stripeFailed: 'Ouverture de Stripe impossible. Veuillez réessayer.',
    recent: 'Derniers versements',
    paidRow: { one: '{date} · {count} commande', other: '{date} · {count} commandes' },
    pendingRow: { one: 'En cours · {count} commande', other: 'En cours · {count} commandes' },
  },
  /** `fields.tsx` — the form controls shared by the shop page and the product form. */
  fields: {
    image: {
      choose: 'Choisir une photo',
      replace: 'Remplacer la photo',
      remove: 'Retirer la photo',
      uploading: 'Envoi…',
      formats: 'JPEG, PNG ou WebP, 8 Mo au maximum.',
      uploadFailed: 'Envoi de la photo impossible.',
    },
  },
};
