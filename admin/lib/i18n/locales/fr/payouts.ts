/**
 * The couriers' payouts (`/payouts`), the shops' (`/payouts/merchants`), and
 * the label maps of `lib/api/payouts.ts`.
 *
 * A few counted sentences were always written in the plural before there were
 * two languages (« 1 livreurs payés »). They are plural messages here so that
 * English can tell one from several, with both French forms left identical:
 * the French on screen is what it was.
 */
export const payouts = {
  // ── lib/api/payouts.ts ────────────────────────────────────────────────────
  failureReason: {
    no_account: 'Pas de compte Stripe',
    stripe_error: 'Refusé par Stripe',
    record_error: 'Envoyé, non enregistré',
  },
  merchantAccount: {
    not_started: 'Compte bancaire non relié — le commerçant le fait depuis son espace',
    onboarding: 'Formulaire Stripe commencé, non terminé',
    review: 'Informations en cours de vérification par Stripe',
    active: 'Compte Stripe actif — payé chaque vendredi',
    unavailable: 'État Stripe indisponible pour le moment',
  },

  // ── /payouts: the couriers ────────────────────────────────────────────────
  title: 'Virements',
  description: 'Ce que la plateforme doit aux livreurs, et l’historique des virements.',
  merchantsLink: 'Versements aux commerces',
  runButton: 'Lancer les virements',
  searchPlaceholder: 'Rechercher un livreur…',
  attemptStatus: {
    paid: 'Payé',
    skipped: 'Ignoré',
    failed: 'Échec',
  },
  runStatus: {
    done: 'Terminé',
    running: 'En cours',
    failed: 'Interrompu',
  },
  trigger: {
    admin: 'Administrateur',
    schedule: 'Planification',
    automatic: 'Automatique',
    automaticFriday: 'Automatique (vendredi)',
  },
  tabs: {
    owed: 'À payer',
    failures: 'Échecs',
    paid: 'Virements',
    history: 'Lancements',
  },
  filters: {
    all: 'Tous les livreurs',
    noAccount: 'Sans compte Stripe',
    failed: 'Dernier virement échoué',
  },
  kpi: {
    owed: 'À payer',
    owedHint: '{couriers} livreurs · {runs} courses',
    noAccount: 'Sans compte Stripe',
    noAccountHint: {
      one: '{count} livreurs ne peuvent pas être payés',
      other: '{count} livreurs ne peuvent pas être payés',
    },
    paid30: 'Versé sur 30 jours',
    paid30Hint: { one: '{count} livreurs payés', other: '{count} livreurs payés' },
    failed30: 'Échecs sur 30 jours',
    failed30Hint: 'Virements refusés ou non enregistrés',
  },
  schedule: {
    title: 'Calendrier',
    subtitle: 'Les virements partent automatiquement chaque vendredi à 3 h (heure de Montréal)',
    lastRun: {
      one: 'Dernier lancement : {date} · {amount} versés à {count} livreurs',
      other: 'Dernier lancement : {date} · {amount} versés à {count} livreurs',
    },
    noRun: 'Aucun virement n’a encore été lancé.',
    oldestUnpaid: 'Course impayée la plus ancienne : {date}',
  },
  columns: {
    courier: 'Livreur',
    amountOwed: 'Montant dû',
    runs: 'Courses',
    oldest: 'Plus ancienne',
    stripeAccount: 'Compte Stripe',
    lastAttempt: 'Dernier essai',
    date: 'Date',
    amount: 'Montant',
    status: 'Statut',
    detail: 'Détail',
    stripeTransfer: 'Virement Stripe',
    startedBy: 'Lancé par',
    paidOut: 'Versé',
    couriers: 'Livreurs',
  },
  account: {
    active: 'Actif',
    configured: 'Configuré',
    toSetUp: 'À configurer',
  },
  noAccountDetail: 'Le livreur n’a pas terminé son inscription Stripe.',
  runCounts: '{paid} payés · {skipped} sans compte · {failed} échecs',
  empty: {
    owedTitle: 'Rien à payer',
    owedBody: 'Aucun livreur n’a de course livrée en attente de virement.',
    failuresTitle: 'Aucun échec',
    failuresBody: 'Aucun virement n’a été refusé jusqu’ici.',
    paidTitle: 'Aucun virement',
    paidBody: 'Aucun livreur n’a encore été payé.',
    historyTitle: 'Aucun lancement',
    historyBody: 'Les virements n’ont encore jamais été lancés.',
  },
  // The toast after a run: one whole sentence per outcome. `count` is the number paid.
  run: {
    done: {
      one: 'Virements terminés : {count} payé ({amount}).',
      other: 'Virements terminés : {count} payés ({amount}).',
    },
    doneSkipped: {
      one: 'Virements terminés : {count} payé ({amount}), {skipped} sans compte Stripe.',
      other: 'Virements terminés : {count} payés ({amount}), {skipped} sans compte Stripe.',
    },
    doneFailed: {
      one: 'Virements terminés : {count} payé ({amount}), {failed} en échec.',
      other: 'Virements terminés : {count} payés ({amount}), {failed} en échec.',
    },
    doneSkippedFailed: {
      one: 'Virements terminés : {count} payé ({amount}), {skipped} sans compte Stripe, {failed} en échec.',
      other: 'Virements terminés : {count} payés ({amount}), {skipped} sans compte Stripe, {failed} en échec.',
    },
    failed: 'Les virements n’ont pas pu être lancés.',
  },
  // The confirmation's description: these sentences one after the other, the second only when someone is skipped.
  confirm: {
    title: 'Lancer les virements ?',
    amount: {
      one: '{amount} seront virés maintenant à {count} livreur via Stripe.',
      other: '{amount} seront virés maintenant à {count} livreurs via Stripe.',
    },
    skipped: {
      one: '{count} livreurs sans compte Stripe ({amount}) seront ignorés et payés au prochain lancement après leur inscription.',
      other: '{count} livreurs sans compte Stripe ({amount}) seront ignorés et payés au prochain lancement après leur inscription.',
    },
    irreversible: 'Un virement envoyé ne peut pas être annulé ici.',
  },
  // Column headers and cell values of the three CSV exports.
  csv: {
    courier: 'Livreur',
    courierId: 'Identifiant livreur',
    amountOwed: 'Montant dû ($)',
    runs: 'Courses',
    oldestRun: 'Plus ancienne course',
    stripeAccount: 'Compte Stripe',
    lastAttempt: 'Dernière tentative',
    reason: 'Motif',
    attemptDate: 'Date de la tentative',
    date: 'Date',
    amount: 'Montant ($)',
    result: 'Résultat',
    error: 'Erreur',
    stripeTransfer: 'Virement Stripe',
    startedBy: 'Lancé par',
    batch: 'Lot',
    start: 'Début',
    end: 'Fin',
    state: 'État',
    paid: 'Payés',
    skipped: 'Ignorés',
    failed: 'Échecs',
    amountPaid: 'Montant payé ($)',
    runDone: 'Terminé',
    runFailed: 'Échec',
    runRunning: 'En cours',
  },

  // ── /payouts/merchants: the shops ─────────────────────────────────────────
  merchants: {
    title: 'Versements aux commerces',
    description: 'Ce que la plateforme doit aux commerces pour les commandes livrées, et les versements effectués.',
    couriersLink: 'Virements des livreurs',
    runButton: 'Payer les commerces',
    loadFailed: 'Impossible de charger les soldes des commerces. Rechargez la page.',
    status: {
      paid: 'Payé',
      pending: 'En cours',
      failed: 'Échec',
    },
    trigger: {
      admin: 'Administrateur',
      schedule: 'Planification',
    },
    notOpen: {
      title: 'Les versements aux commerces ne sont pas ouverts',
      body: 'Aucun commerce n’est payé tant que la date de départ n’est pas fixée sur le serveur (variable MERCHANT_PAYOUTS_FROM). Les commandes livrées avant cette date ne seront jamais payées par la plateforme : fixez-la au jour où les vrais paiements commencent.',
    },
    kpi: {
      toPay: 'À verser',
      toPayHint: { one: '{count} commerce avec un compte Stripe', other: '{count} commerces avec un compte Stripe' },
      noAccount: 'Sans compte Stripe',
      noAccountHint: {
        one: '{count} commerce en attente de leur compte bancaire',
        other: '{count} commerces en attente de leur compte bancaire',
      },
      inDebt: 'Dû par des commerces',
      inDebtHint: 'Remboursements à retenir sur les prochains versements',
    },
    owed: {
      title: 'À verser',
      subtitleSince: 'Commandes livrées depuis le {date}, non encore versées. Versement automatique chaque vendredi.',
      subtitle: 'Commandes livrées et non encore versées.',
      emptyTitle: 'Rien à verser',
      emptyNotOpen: 'Les soldes s’afficheront ici une fois les versements ouverts.',
      emptyBody: 'Aucun commerce n’a de commande livrée en attente de versement.',
    },
    history: {
      title: 'Historique',
      emptyTitle: 'Aucun versement',
      emptyBody: 'Aucun commerce n’a encore été payé.',
    },
    columns: {
      shop: 'Commerce',
      nextPayout: 'Prochain versement',
      orders: 'Commandes',
      refundsWithheld: 'Remboursements retenus',
      oldest: 'Plus ancienne',
      stripeAccount: 'Compte Stripe',
      date: 'Date',
      amount: 'Montant',
      status: 'Statut',
      startedBy: 'Lancé par',
    },
    account: {
      linked: 'Relié',
      toSetUp: 'À configurer',
    },
    // The toast after a run: one whole sentence per outcome. `count` is the number paid.
    run: {
      notOpen: 'Les versements aux commerces ne sont pas ouverts sur ce serveur : rien n’a été envoyé.',
      done: {
        one: 'Versements terminés : {count} payé ({amount}).',
        other: 'Versements terminés : {count} payés ({amount}).',
      },
      doneSkipped: {
        one: 'Versements terminés : {count} payé ({amount}), {skipped} sans compte Stripe prêt.',
        other: 'Versements terminés : {count} payés ({amount}), {skipped} sans compte Stripe prêt.',
      },
      doneFailed: {
        one: 'Versements terminés : {count} payé ({amount}), {failed} en échec.',
        other: 'Versements terminés : {count} payés ({amount}), {failed} en échec.',
      },
      doneSkippedFailed: {
        one: 'Versements terminés : {count} payé ({amount}), {skipped} sans compte Stripe prêt, {failed} en échec.',
        other: 'Versements terminés : {count} payés ({amount}), {skipped} sans compte Stripe prêt, {failed} en échec.',
      },
      failed: 'Les versements n’ont pas pu être lancés.',
    },
    // The confirmation's description: these sentences one after the other, the second only when a shop is skipped.
    confirm: {
      title: 'Payer les commerces ?',
      amount: {
        one: '{amount} seront virés maintenant à {count} commerce via Stripe.',
        other: '{amount} seront virés maintenant à {count} commerces via Stripe.',
      },
      skipped: '{count} sans compte Stripe ({amount}) seront ignorés et payés au premier lancement après leur inscription.',
      notes:
        'Un commerce dont Stripe n’a pas fini de vérifier le compte est ignoré lui aussi. Un versement envoyé ne peut pas être annulé ici.',
    },
  },
};
