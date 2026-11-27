/** Administrators and roles: the team, the access dialog, the roles editor, one administrator's page. */
export const admins = {
  title: 'Administrateurs',
  description: 'Qui peut ouvrir ce tableau de bord, et ce que chacun peut y faire. Chaque changement est inscrit au journal d’audit.',
  /** Words the list, the dialogs and the administrator's page have in common. */
  shared: {
    role: 'Rôle',
    lastSignIn: 'Dernière connexion',
    memberSince: 'Membre depuis',
    neverSignedIn: 'Jamais connecté',
    saving: 'Enregistrement…',
    saveFailed: 'Enregistrement impossible.',
  },
  kpis: {
    team: 'Membres de l’équipe',
    teamHint: 'Avec un accès au tableau de bord',
    roles: 'Rôles',
    rolesHint: '{custom} personnalisés · {system} prédéfinis',
    canManage: 'Peuvent gérer les accès',
    canManageHint: 'Toujours au moins un',
    neverSignedIn: 'Jamais connectés',
    neverSignedInHint: 'Mot de passe temporaire pas encore utilisé',
  },
  tabs: {
    members: 'Membres',
    membersCount: 'Membres · {count}',
    roles: 'Rôles',
    rolesCount: 'Rôles · {count}',
  },
  members: {
    roleChanged: '{name} est maintenant « {role} ».',
    roleChangeFailed: 'Changement impossible.',
    revoked: '{name} n’a plus accès au tableau de bord.',
    revokeFailed: 'Action impossible.',
    created: {
      title: 'Accès créé pour {email} — {role}',
      body: 'Mot de passe temporaire, affiché une seule fois. Transmettez-le en privé ; la personne le change dans « Mon compte » après sa première connexion.',
      copied: 'Mot de passe copié.',
      copyFailed: 'Copie impossible — sélectionnez-le à la main.',
      copy: 'Copier',
      dismiss: 'J’ai transmis le mot de passe',
    },
    add: 'Ajouter un administrateur',
    columns: {
      admin: 'Administrateur',
    },
    you: 'Vous',
    roleOf: 'Rôle de {name}',
    customize: 'Personnaliser…',
    revoke: 'Retirer',
    revokeConfirm: {
      title: 'Retirer l’accès de {name} ?',
      description:
        'La personne ne peut plus ouvrir le tableau de bord, dès maintenant, et son compte est bloqué. Le motif (facultatif) est inscrit au journal d’audit.',
      confirm: 'Retirer l’accès',
    },
  },
  /** The dialog that adds an administrator or changes one's access. */
  access: {
    // Stored as the new role's name and description, in the language of whoever created it.
    customRoleName: 'Personnalisé — {name}',
    customRoleDescription: 'Accès sur mesure pour {name}.',
    updated: 'Accès de {name} mis à jour — {role}.',
    titleFor: 'Accès de {name}',
    titleNew: 'Ajouter un administrateur',
    fullName: 'Nom et prénom',
    email: 'Courriel professionnel',
    emailHelper: 'Une adresse réservée à l’administration.',
    customOption: '{name} (personnalisé)',
    customChoice: 'Personnalisé — selon les modules cochés',
    customHint: 'Un rôle sur mesure sera créé pour cette personne, visible dans l’onglet Rôles.',
    modules: 'Modules autorisés ({on} / {total})',
    adminsWarning: '« Administrateurs » permet d’ajouter, retirer et changer les accès de tous — le droit le plus étendu.',
    save: 'Enregistrer l’accès',
    create: 'Créer l’accès',
  },
  roles: {
    deleted: 'Rôle « {name} » supprimé.',
    deleteFailed: 'Suppression impossible.',
    new: 'Nouveau rôle',
    system: 'Prédéfini',
    custom: 'Personnalisé',
    memberCount: { one: '{count} membre', other: '{count} membres' },
    deleteBlocked: 'Attribué à des administrateurs — changez d’abord leur rôle.',
    deleteConfirm: {
      title: 'Supprimer le rôle « {name} » ?',
      description: 'Aucun administrateur n’a ce rôle. La suppression est inscrite au journal d’audit.',
    },
    editor: {
      updated: 'Rôle mis à jour.',
      created: 'Rôle « {name} » créé.',
      editTitle: 'Modifier « {name} »',
      startFrom: 'Partir de',
      startFromNothing: '— rien —',
      name: 'Nom du rôle',
      description: 'Description',
      descriptionHelper: 'Ce que fait une personne avec ce rôle.',
      adminsWarning: 'Ce rôle peut ajouter et retirer des administrateurs, et modifier les rôles — c’est le droit le plus étendu.',
      create: 'Créer le rôle',
    },
  },
  /** One administrator's page. */
  detail: {
    notFoundTitle: 'Administrateur introuvable',
    notFoundBody: 'Cette personne n’a peut-être plus accès au tableau de bord.',
    account: 'Compte',
    email: 'Courriel',
    roleTitle: 'Rôle : {role}',
    allRoles: 'Voir tous les rôles →',
    recentActions: 'Actions récentes',
    noActions: 'Aucune action enregistrée.',
    accessHistory: 'Historique de l’accès',
    noHistory: 'Aucun changement enregistré.',
    activityHidden: 'L’activité de cette personne est visible avec la permission « Consulter le journal ».',
    quotedReason: '« {reason} »',
    byActor: 'par {name}',
  },
  /**
   * The permission catalogue, by code. The API sends it worded in French
   * (`api/src/admin/permissions.ts`); these are the same words, keyed so that
   * English can have its own — see `permissionAreaLabel` / `permissionLabel`
   * in `lib/api/admins.ts`. A group is keyed by what its permissions start
   * with (`orders.view` → `orders`), a permission by its key with the dot
   * turned into an underscore (`payouts.run` → `payouts_run`).
   */
  permissionGroups: {
    dashboard: 'Tableau de bord',
    orders: 'Commandes',
    disputes: 'Litiges',
    courier_issues: 'Incidents livreurs',
    vendors: 'Commerçants',
    couriers: 'Livreurs',
    users: 'Utilisateurs',
    support: 'Support',
    moderation: 'Modération',
    specialties: 'Spécialités',
    settings: 'Paramètres',
    payouts: 'Virements',
    audit: 'Journal d’audit',
    admins: 'Administrateurs',
  },
  permissions: {
    dashboard_view: 'Voir l’aperçu et la recherche',
    orders_view: 'Voir les commandes',
    orders_refund: 'Annuler ou rembourser une commande',
    disputes_view: 'Voir les litiges',
    disputes_resolve: 'Trancher un litige',
    courier_issues_view: 'Voir les incidents',
    courier_issues_resolve: 'Résoudre un incident',
    vendors_view: 'Voir les commerces et leurs dossiers',
    vendors_decide: 'Approuver, refuser, suspendre',
    couriers_view: 'Voir les livreurs et leurs dossiers',
    couriers_decide: 'Approuver, refuser, suspendre',
    users_view: 'Voir les comptes',
    users_block: 'Bloquer et débloquer un compte',
    support_view: 'Lire les conversations',
    support_reply: 'Répondre et résoudre',
    moderation_view: 'Voir avis, codes promo et produits',
    moderation_act: 'Masquer, retirer, désactiver',
    specialties_view: 'Voir la liste',
    specialties_manage: 'Ajouter, renommer, retirer',
    settings_view: 'Voir les paramètres',
    settings_manage: 'Modifier commission, abonnement, points',
    payouts_view: 'Voir les montants dus et l’historique des virements',
    payouts_run: 'Relancer les virements des livreurs et des commerçants',
    audit_view: 'Consulter le journal',
    admins_view: 'Voir les administrateurs et les rôles',
    admins_manage: 'Ajouter, retirer, changer les rôles',
  },
  /**
   * The five built-in roles, by slug — named and described in French by the
   * database (migration `0043_admin_roles`), and never editable. A custom role
   * keeps the name it was given: see `roleName` / `roleDescription`.
   */
  systemRoles: {
    owner: {
      name: 'Propriétaire',
      description: 'Tous les droits, y compris les administrateurs et les paramètres de la plateforme.',
    },
    operations: {
      name: 'Opérations',
      description: 'Dossiers des commerçants et des livreurs, commandes, incidents de livraison, spécialités.',
    },
    support: {
      name: 'Support client',
      description: 'Assistance, litiges, blocage de comptes et modération des contenus.',
    },
    finance: {
      name: 'Finance',
      description: 'Commandes, remboursements, virements des livreurs, lecture des paramètres et du journal.',
    },
    readonly: {
      name: 'Lecture seule',
      description: 'Consulte tout le tableau de bord, sans rien pouvoir modifier.',
    },
  },
};
