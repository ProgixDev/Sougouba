import type { BadgeTone } from '@/components/ui';
import type { VendorStatus, CourierStatus, OrderStatus, AdminDisputeStatus, CourierIssueStatus } from './types';

export function vendorStatusMeta(status: VendorStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: 'En attente', tone: 'warning' };
    case 'approved':
      return { label: 'Approuvé', tone: 'success' };
    case 'suspended':
      return { label: 'Suspendu', tone: 'destructive' };
  }
}

export function courierStatusMeta(status: CourierStatus): { label: string; tone: BadgeTone } {
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
