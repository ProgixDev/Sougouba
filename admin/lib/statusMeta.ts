import type { BadgeTone } from '@/components/ui';
import type { AdminVendorStatus, AdminCourierStatus, OrderStatus, AdminDisputeStatus, CourierIssueStatus } from './types';

/**
 * These switches are exhaustive with no `default`, which is the point: a status
 * the API can return but this app has no label for is a compile error, not a
 * blank badge. Adding `rejected` here was exactly that — the API distinguishes
 * a refused application from a suspended one, and the mock never could.
 */
export function vendorStatusMeta(status: AdminVendorStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: 'En attente', tone: 'warning' };
    case 'approved':
      return { label: 'Approuvé', tone: 'success' };
    case 'suspended':
      return { label: 'Suspendu', tone: 'destructive' };
    // Terminal, unlike a suspension — worth a distinct label so a reviewer can
    // see at a glance that there is no way back from this one.
    case 'rejected':
      return { label: 'Refusé', tone: 'destructive' };
  }
}

export function courierStatusMeta(status: AdminCourierStatus): { label: string; tone: BadgeTone } {
  return vendorStatusMeta(status);
}

export function orderStatusMeta(status: OrderStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: 'En attente', tone: 'neutral' };
    case 'confirmed':
      return { label: 'Confirmée', tone: 'primary' };
    case 'preparing':
      return { label: 'En préparation', tone: 'warning' };
    case 'ready':
      return { label: 'Prête', tone: 'secondary' };
    case 'out_for_delivery':
      return { label: 'En livraison', tone: 'primary' };
    case 'delivered':
      return { label: 'Livrée', tone: 'success' };
    case 'cancelled':
      return { label: 'Annulée', tone: 'destructive' };
  }
}

export function disputeStatusMeta(status: AdminDisputeStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'open':
      return { label: 'Ouvert', tone: 'destructive' };
    case 'answered':
      return { label: 'Répondu', tone: 'warning' };
    case 'resolved':
      return { label: 'Résolu', tone: 'success' };
    case 'rejected':
      return { label: 'Rejeté', tone: 'neutral' };
  }
}

export function courierIssueStatusMeta(status: CourierIssueStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'open':
      return { label: 'Ouvert', tone: 'destructive' };
    case 'resolved':
      return { label: 'Résolu', tone: 'success' };
  }
}

export const DISPUTE_REASON_LABELS: Record<string, string> = {
  missing_items: 'Articles manquants',
  wrong_order: 'Mauvaise commande',
  quality: 'Qualité',
  late: 'Retard',
  other: 'Autre',
};

export const COURIER_ISSUE_REASON_LABELS: Record<string, string> = {
  customer_absent: 'Client absent',
  wrong_address: 'Adresse erronée',
  access_problem: "Problème d'accès",
  shop_not_ready: 'Commerce non prêt',
  order_incomplete: 'Commande incomplète',
  other: 'Autre',
};

export const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Vélo',
  scooter: 'Scooter',
  car: 'Voiture',
};
