import { SetMetadata } from '@nestjs/common';

/**
 * Every permission an administrator role can hold — the catalogue the role
 * editor shows, and the only values `admin_roles.permissions` may contain.
 *
 * Grouped by area, one `view` and (where there is something to do) one action.
 * Adding a back-office feature means adding its permission here and to the
 * built-in roles that should have it (a migration, like `0043`).
 */
export const PERMISSION_GROUPS = [
  { area: 'Tableau de bord', permissions: [{ key: 'dashboard.view', label: 'Voir l’aperçu et la recherche' }] },
  {
    area: 'Commandes',
    permissions: [
      { key: 'orders.view', label: 'Voir les commandes' },
      { key: 'orders.refund', label: 'Annuler ou rembourser une commande' },
    ],
  },
  {
    area: 'Litiges',
    permissions: [
      { key: 'disputes.view', label: 'Voir les litiges' },
      { key: 'disputes.resolve', label: 'Trancher un litige' },
    ],
  },
  {
    area: 'Incidents livreurs',
    permissions: [
      { key: 'courier_issues.view', label: 'Voir les incidents' },
      { key: 'courier_issues.resolve', label: 'Résoudre un incident' },
    ],
  },
  {
    area: 'Commerçants',
    permissions: [
      { key: 'vendors.view', label: 'Voir les commerces et leurs dossiers' },
      { key: 'vendors.decide', label: 'Approuver, refuser, suspendre' },
    ],
  },
  {
    area: 'Livreurs',
    permissions: [
      { key: 'couriers.view', label: 'Voir les livreurs et leurs dossiers' },
      { key: 'couriers.decide', label: 'Approuver, refuser, suspendre' },
    ],
  },
  {
    area: 'Utilisateurs',
    permissions: [
      { key: 'users.view', label: 'Voir les comptes' },
      { key: 'users.block', label: 'Bloquer et débloquer un compte' },
    ],
  },
  {
    area: 'Support',
    permissions: [
      { key: 'support.view', label: 'Lire les conversations' },
      { key: 'support.reply', label: 'Répondre et résoudre' },
    ],
  },
  {
    area: 'Modération',
    permissions: [
      { key: 'moderation.view', label: 'Voir avis, codes promo et produits' },
      { key: 'moderation.act', label: 'Masquer, retirer, désactiver' },
    ],
  },
  {
    area: 'Spécialités',
    permissions: [
      { key: 'specialties.view', label: 'Voir la liste' },
      { key: 'specialties.manage', label: 'Ajouter, renommer, retirer' },
    ],
  },
  {
    area: 'Paramètres',
    permissions: [
      { key: 'settings.view', label: 'Voir les paramètres' },
      { key: 'settings.manage', label: 'Modifier commission, abonnement, points' },
    ],
  },
  {
    area: 'Virements',
    permissions: [
      { key: 'payouts.view', label: 'Voir les montants dus et l’historique des virements' },
      { key: 'payouts.run', label: 'Relancer les virements des livreurs et des commerçants' },
    ],
  },
  { area: 'Journal d’audit', permissions: [{ key: 'audit.view', label: 'Consulter le journal' }] },
  {
    area: 'Administrateurs',
    permissions: [
      { key: 'admins.view', label: 'Voir les administrateurs et les rôles' },
      { key: 'admins.manage', label: 'Ajouter, retirer, changer les rôles' },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['permissions'][number]['key'];

export const PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

/** Route metadata key read by `AdminGuard`. */
export const PERMISSION_KEY = 'adminPermission';

/** Any signed-in administrator, whatever their role — "who am I" and nothing else. */
export const ANY_ADMIN = '*';

/**
 * The permission an admin route needs. **Every** admin route carries one:
 * `AdminGuard` refuses a route without it (fail closed), and
 * `permissions.spec.ts` fails the build if one is missing.
 */
export const RequirePermission = (permission: Permission | typeof ANY_ADMIN) => SetMetadata(PERMISSION_KEY, permission);
