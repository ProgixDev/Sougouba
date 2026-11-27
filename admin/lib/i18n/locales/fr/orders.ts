/** Orders in the back office: the list with its alerts and figures, and one order's file. */
export const orders = {
  /** Who is speaking, and the name shown when a person has none. */
  roles: {
    customer: 'Client',
    merchant: 'Commerçant',
    courier: 'Livreur',
  },
  list: {
    title: 'Commandes',
    description: 'Toutes les commandes de la plateforme, et leur tendance.',
    filters: {
      allStatuses: 'Tous les statuts',
      searchPlaceholder: 'Rechercher un numéro ou un client…',
    },
    columns: {
      order: 'Commande',
      customer: 'Client',
      shop: 'Commerce',
      date: 'Date',
      total: 'Total',
      status: 'Statut',
    },
    csv: {
      type: 'Type',
      courier: 'Livreur',
      subtotal: 'Sous-total ($)',
      total: 'Total ($)',
      refundedOn: 'Remboursé le',
      refundAmount: 'Montant remboursé ($)',
      dispute: 'Litige',
      courierIssue: 'Incident livreur',
    },
    /** « 3 h 10 » — minutes and days are in `common.time`. */
    waitHours: '{hours} h {minutes}',
    autoCancelOff: 'L’annulation automatique est désactivée : c’est à vous de décider.',
    unanswered: {
      title: { one: '{count} commande sans réponse du commerce', other: '{count} commandes sans réponse du commerce' },
      autoCancel:
        'Une commande sans réponse est annulée et remboursée automatiquement après {minutes} min. Celles-ci attendent depuis plus d’un jour : elles restent à annuler à la main.',
    },
    latePickups: {
      title: {
        one: '{count} commande acceptée par un livreur qui ne vient pas',
        other: '{count} commandes acceptées par un livreur qui ne vient pas',
      },
      autoRelease:
        'Un livreur en retard de {minutes} min perd la course, qui repart vers un autre. Celles-ci n’ont pas été reprises : retard de plus d’un jour, ou un incident a été signalé dessus.',
      autoReleaseOff: 'Le retrait automatique est désactivé : c’est à vous de décider.',
      courier: 'Livreur : {name}',
      issueReported: 'incident signalé',
      late: '{duration} de retard',
    },
    waiting: {
      title: { one: '{count} commande prête sans livreur', other: '{count} commandes prêtes sans livreur' },
      intro: 'Prêtes depuis plus de {minutes} min, aucun livreur ne les a prises.',
      autoCancel:
        'Elles sont annulées et remboursées automatiquement après {minutes} min — sauf celles qui attendent depuis plus d’un jour, qui restent à traiter à la main.',
      noCourierInRange: 'aucun livreur à portée',
      couriersAsked: { one: '{count} livreur sollicité', other: '{count} livreurs sollicités' },
    },
    kpis: {
      orders30: 'Commandes · 30 j',
      ordersHint: '{today} aujourd’hui · {active} en cours',
      gmv30: 'Volume d’affaires · 30 j',
      avgBasket: 'Panier moyen {amount}',
      unassigned: 'Sans livreur',
      unassignedHint: 'Commandes prêtes ou en préparation, en attente d’un livreur',
      cancelRate30: 'Taux d’annulation · 30 j',
      refunded: '{amount} remboursés',
    },
    charts: {
      gmvByDay: 'Volume d’affaires par jour',
      gmvByDayHint: 'Total des commandes, hors annulées, 30 jours',
      byStatus: 'Par statut',
      byStatusHint: 'Commandes des 30 derniers jours',
      delivered: 'Livrées',
      outForDelivery: 'En livraison',
      preparing: 'En préparation',
      cancelled: 'Annulées',
    },
    empty: {
      title: 'Aucune commande',
      description: 'Aucune commande ne correspond à ce filtre pour le moment.',
    },
  },
  detail: {
    notFound: 'Commande introuvable',
    title: 'Commande #{id}',
    receipt: {
      label: 'Reçu',
      numbered: 'Reçu {number}',
      emailedOn: 'envoyé au client le {date}',
      notEmailed: 'pas encore envoyé par courriel',
      pdf: 'Reçu (PDF)',
      resend: 'Renvoyer le reçu',
      sending: 'Envoi…',
      resent: 'Reçu renvoyé au client par courriel.',
      openFailed: 'Le reçu n’a pas pu être ouvert.',
      sendFailed: 'Le reçu n’a pas pu être envoyé.',
    },
    /** The action: its button, its confirmation and what it answers. */
    cancel: {
      action: 'Annuler la commande',
      confirmTitle: 'Annuler cette commande ?',
      willRefund: 'Le client sera remboursé de {amount}, le stock et ses points lui reviennent.',
      nothingToRefund: 'Le stock et les points du client lui reviennent. Aucun paiement par carte à rembourser.',
      courierCarrying:
        'Attention : un livreur a déjà récupéré cette commande. Il sera libéré et ne sera pas payé pour cette course.',
      courierAssigned: 'Le livreur assigné sera libéré.',
      final: 'Le client, le commerçant et le livreur sont prévenus. Cette action est définitive.',
      reasonLabel: 'Motif (visible dans le journal d’audit)',
      refundFailed: 'Commande annulée, mais le remboursement n’est pas parti. Remboursez le client depuis Stripe.',
      refunded: 'Commande annulée. {amount} remboursés au client.',
      noRefund: 'Commande annulée. Aucun paiement à rembourser.',
      failed: 'La commande n’a pas pu être annulée.',
    },
    /** The card on an order that was cancelled. */
    cancellation: {
      on: 'Le',
      reason: 'Motif',
      customerNote: 'Précisions du client',
      refund: 'Remboursement',
      refundedOn: '{amount} le {date}',
      refundPending: 'Pas encore envoyé — à faire depuis Stripe',
      noCardPayment: 'Aucun paiement par carte sur cette commande',
    },
    items: {
      title: 'Articles',
      qtyPrice: 'Qté {qty} × {price}',
      subtotal: 'Sous-total',
      gst: 'TPS',
      qst: 'TVQ',
      delivery: 'Livraison',
      total: 'Total',
    },
    delivery: {
      title: 'Livraison',
      dropoff: 'Remise',
      leaveAtDoor: 'Laisser à la porte',
      inPerson: 'En main propre',
      unit: 'Appartement',
      doorCode: 'Code de porte',
      instructions: 'Instructions',
    },
    statusHistory: 'Historique du statut',
    releases: {
      title: 'Livreurs qui ont eu cette commande',
      deletedCourier: 'Livreur supprimé',
      cancelledAfterPickup: 'Avait récupéré la commande quand elle a été annulée',
      cancelledEnRoute: 'En route vers le commerce quand la commande a été annulée',
      noShow: 'Course retirée automatiquement : commande non récupérée à temps',
      gaveBack: 'A rendu la course — {reason}',
      /** What happened, then what the courier wrote about it. */
      withNote: '{summary} : {note}',
    },
    dispute: {
      title: 'Litige — {reason}',
      link: 'Voir dans la file des litiges →',
    },
    courierIssue: {
      title: 'Incident livreur — {reason}',
      link: 'Voir dans la file des incidents →',
    },
  },
};
