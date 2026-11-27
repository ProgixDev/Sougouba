/** The back office's users section: the account directory, and one account's page. */
export const users = {
  /** One person's role: the badge on a row, and the export. */
  roles: {
    customer: 'Client',
    business: 'Commerçant',
    courier: 'Livreur',
    admin: 'Administrateur',
  },
  /** The same roles as groups of people: the tabs, the first KPI and the breakdown. */
  roleGroups: {
    customer: 'Clients',
    business: 'Commerçants',
    courier: 'Livreurs',
    admin: 'Administrateurs',
    none: 'Sans rôle',
  },
  /** What is known about an account — table headers, export headers and the account's page share these. */
  fields: {
    name: 'Nom',
    email: 'Courriel',
    role: 'Rôle',
    memberSince: 'Membre depuis',
    lastSignIn: 'Dernière connexion',
  },
  list: {
    title: 'Utilisateurs',
    description: 'Tous les comptes de la plateforme : clients, commerçants et livreurs.',
    allTab: 'Tous',
    columns: {
      joined: 'Inscrit',
      linkedTo: 'Lié à',
    },
    csv: {
      id: 'Identifiant',
      linkedShop: 'Commerce lié',
      linkedCourier: 'Livreur lié',
    },
    kpi: {
      customersHint: { one: '{count} a déjà commandé', other: '{count} ont déjà commandé' },
      newAccounts: 'Nouveaux comptes · 30 j',
      newAccountsHint: 'Tous rôles confondus',
      professionals: 'Commerçants · livreurs',
      professionalsHint: { one: '{count} compte sans rôle choisi', other: '{count} comptes sans rôle choisi' },
      blocked: 'Comptes bloqués',
      blockedHint: 'Connexion et paiement refusés',
    },
    signups: {
      title: 'Inscriptions',
      subtitle: 'Nouveaux comptes par semaine, 8 semaines',
    },
    byRole: 'Par rôle',
    searchPlaceholder: 'Rechercher un nom ou un courriel…',
    emptyTitle: 'Aucun utilisateur',
    emptyDescription: 'Aucun utilisateur ne correspond à ce filtre pour le moment.',
  },
  detail: {
    notFound: 'Utilisateur introuvable',
    blockedBadge: 'Bloqué',
    actions: {
      block: 'Bloquer',
      unblock: 'Débloquer',
    },
    toasts: {
      blocked: '{name} a été bloqué.',
      unblocked: '{name} a été débloqué.',
      failed: 'Action impossible.',
    },
    blockedNotice:
      'Ce compte ne peut plus se connecter ni commander. Ses commandes et son historique sont conservés. Le motif figure dans le journal d’audit.',
    contact: {
      title: 'Coordonnées',
    },
    link: {
      title: 'Rattachement',
      savedAddresses: 'Adresses enregistrées',
    },
    dialog: {
      blockTitle: 'Bloquer ce compte ?',
      blockDescription:
        'La personne ne pourra plus se connecter ni passer commande (au plus tard d’ici une heure pour une session déjà ouverte, immédiatement au paiement). Rien n’est supprimé. Précisez le motif.',
      unblockTitle: 'Débloquer ce compte ?',
      unblockDescription: 'La personne pourra de nouveau se connecter et commander.',
    },
  },
};
