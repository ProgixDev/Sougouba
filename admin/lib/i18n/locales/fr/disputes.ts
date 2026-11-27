/** Customers' disputes: the queue with its figures, and one dispute's thread and decision. */
export const disputes = {
  list: {
    title: 'Litiges',
    description: 'Réclamations des clients à trier, trancher et rembourser.',
    tabs: {
      open: 'Ouverts',
      answered: 'Répondus',
      resolved: 'Résolus',
      rejected: 'Rejetés',
      all: 'Tous',
    },
    columns: {
      order: 'Commande',
      customer: 'Client',
      shop: 'Commerce',
      reason: 'Motif',
      opened: 'Ouvert',
      status: 'Statut',
    },
    kpis: {
      toHandle: 'À traiter',
      toHandleHint: '{count} avec une réponse du commerçant',
      decided: 'Tranchés',
      decidedHint: '{resolved} donnés au client · {rejected} rejetés',
      avgDecision: 'Délai moyen de décision',
      opened30: '{count} ouverts sur 30 jours',
      refunded30: 'Remboursé · 30 j',
      refundedHint: 'Suite à un litige',
    },
    reasons: {
      title: 'Motifs',
      subtitle: 'Tous les litiges, par raison invoquée',
    },
    outcome: {
      title: 'Issue',
      subtitle: 'Où en sont les litiges',
      merchantReplied: 'Réponse du commerçant',
    },
    empty: {
      title: 'Aucun litige',
      description: 'Aucun litige ne correspond à ce filtre pour le moment.',
    },
  },
  detail: {
    notFound: 'Litige introuvable',
    title: 'Litige — {reason}',
    orderLink: 'Commande #{id}',
    markResolved: 'Marquer résolu',
    rejectClaim: 'Rejeter la réclamation',
    thread: {
      title: 'Fil de la réclamation',
      customer: 'Client',
      merchant: 'Commerçant',
      adminDecision: 'Administrateur — décision',
    },
    confirm: {
      resolveTitle: 'Marquer ce litige comme résolu ?',
      rejectTitle: 'Rejeter cette réclamation ?',
      description: 'Ajoutez une note de décision — elle reste dans le dossier de la commande pour référence.',
      reject: 'Rejeter',
      noteLabel: 'Note de décision',
    },
    toast: {
      resolved: 'Litige marqué comme résolu.',
      rejected: 'Litige marqué comme rejeté.',
    },
  },
};
