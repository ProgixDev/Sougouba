/** Problems couriers report during a run: the queue with its figures, and one report. */
export const courierIssues = {
  list: {
    title: 'Incidents livreurs',
    description: 'Problèmes signalés par les livreurs pendant une course.',
    tabs: {
      open: 'Ouverts',
      resolved: 'Résolus',
      all: 'Tous',
    },
    columns: {
      order: 'Commande',
      courier: 'Livreur',
      shop: 'Commerce',
      reason: 'Motif',
      reported: 'Signalé',
      status: 'Statut',
    },
    kpis: {
      open: 'Ouverts',
      openHint: 'Un livreur attend une décision',
      resolved: 'Résolus',
      reported30: '{count} signalés sur 30 jours',
      avgTime: 'Délai moyen',
      avgTimeHint: 'Du signalement à la résolution',
    },
    reasons: {
      title: 'Motifs',
      subtitle: 'Tous les incidents, par cause',
    },
    empty: {
      title: 'Aucun incident',
      description: 'Aucun incident ne correspond à ce filtre pour le moment.',
    },
  },
  detail: {
    notFound: 'Incident introuvable',
    title: 'Incident — {reason}',
    unassignedCourier: 'Livreur non assigné',
    orderLink: 'Commande #{id}',
    markResolved: 'Marquer résolu',
    report: 'Rapport du livreur',
    resolvedOn: 'Résolu le {date}',
    confirm: {
      title: 'Marquer cet incident comme résolu ?',
      description: 'Expliquez ce qui a été fait — la note est ajoutée au rapport et reste consultable.',
      noteLabel: 'Note de résolution',
    },
    resolved: 'Incident marqué comme résolu.',
  },
};
