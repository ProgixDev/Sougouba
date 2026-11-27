/** The administrators' home page (`/`): the platform at a glance. */
export const overview = {
  title: 'Aperçu de la plateforme',
  description: 'L’activité, les revenus et les files d’attente, en un coup d’œil.',
  // The period buttons: 7, 30 and 90.
  rangeDays: '{count} jours',
  stats: {
    gmv: 'GMV',
    orders: 'Commandes',
    commissionRevenue: 'Revenu de commission',
    approvedMerchants: 'Commerçants approuvés',
    approvedCouriers: 'Livreurs approuvés',
    pendingApproval: "En attente d'approbation",
  },
  charts: {
    gmvOverTime: 'GMV dans le temps',
    topMerchants: 'Meilleurs commerçants (revenu)',
  },
  queues: {
    title: 'Litiges & incidents ouverts',
    disputes: 'Litiges clients',
    courierIssues: 'Incidents livreurs',
  },
  ordersByVertical: 'Commandes par secteur',
};
