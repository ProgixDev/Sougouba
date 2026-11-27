/** The platform settings page: commission, subscription, loyalty rules and the automatic delays. */
export const settings = {
  title: 'Paramètres de la plateforme',
  description: 'Monétisation et règles du programme de fidélité, appliquées à toute la plateforme.',
  saving: 'Enregistrement…',
  readOnly: 'Lecture seule — votre rôle ne permet pas de modifier les paramètres.',
  saved: 'Paramètres enregistrés.',
  saveFailed: 'Les paramètres n’ont pas pu être enregistrés.',
  monetization: {
    title: 'Monétisation',
    intro: 'Appliquées simultanément à chaque commerçant — commission par vente et abonnement mensuel.',
    commissionRate: 'Taux de commission (%)',
    commissionHelper: 'Calculé sur le sous-total des ventes, hors taxes et livraison.',
    monthlySubscription: 'Abonnement mensuel (CAD)',
  },
  loyalty: {
    title: 'Points Sougouba (fidélité)',
    intro: 'Règles du programme de points, coupons et parrainage.',
    pointsPerCad: 'Points gagnés par $ dépensé',
    pointsPerCadRedeemed: 'Points requis pour 1 $ de rabais',
    redemptionCap: 'Plafond de rachat (% du sous-total)',
    pointsExpiry: 'Expiration des points (mois)',
    referralPoints: 'Points de parrainage (chaque partie)',
    referralMinFirstOrder: '1re commande min. pour parrainage (CAD)',
    doublePointsTitle: 'Journées points doublés',
    doublePointsBody: 'Double temporairement les points gagnés sur chaque commande livrée.',
  },
  shopConfirm: {
    title: 'Commande sans réponse du commerce',
    intro:
      'Le client paie en commandant. Si le commerce n’accepte pas la commande, il reçoit un rappel, puis elle est annulée et le client remboursé en totalité. Le délai compte à partir de la commande.',
    remindAfter: 'Rappeler le commerce après (minutes)',
    remindHelper: 'Une notification sur son téléphone, une seule fois. 0 = pas de rappel.',
    cancelAfter: 'Annuler et rembourser après (minutes)',
    cancelHelper: 'Doit être plus long que le délai de rappel. 0 = jamais automatiquement.',
  },
  courierLate: {
    title: 'Livreur qui ne vient pas chercher la commande',
    intro:
      'Un livreur qui accepte une course la bloque pour les autres. Le retard se compte à partir de l’heure d’arrivée estimée quand il a accepté (selon sa distance et son véhicule). La course retirée repart vers un autre livreur ; une course sur laquelle le livreur a signalé un incident n’est jamais retirée automatiquement.',
    remindAfter: 'Rappeler le livreur après (minutes de retard)',
    remindHelper: 'Une notification, une seule fois. 0 = pas de rappel.',
    releaseAfter: 'Retirer la course après (minutes de retard)',
    releaseHelper: 'Doit être plus long que le délai de rappel. 0 = jamais automatiquement.',
  },
  noCourier: {
    title: 'Commande prête, sans livreur',
    intro:
      'Ce qui arrive quand une commande est prête et qu’aucun livreur ne la prend. Le délai compte à partir du moment où elle est prête — ou du moment où un livreur l’a rendue.',
    alertAfter: 'Prévenir l’équipe après (minutes)',
    alertHelper: 'Un courriel à l’équipe, et la commande s’affiche en haut de la page Commandes.',
    cancelAfter: 'Annuler et rembourser après (minutes)',
    cancelHelper: 'Doit être plus long que le délai d’alerte. 0 = jamais automatiquement : l’équipe décide.',
  },
};
