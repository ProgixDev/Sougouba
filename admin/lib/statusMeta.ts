import type { BadgeTone } from '@/components/ui';
import { t, lazy } from './i18n';
import type { AdminVendorStatus, AdminCourierStatus, OrderStatus, AdminDisputeStatus, CourierIssueStatus } from './types';

/**
 * These switches are exhaustive with no `default`, which is the point: a status
 * the API can return but this app has no label for is a compile error, not a
 * blank badge. Adding `rejected` here was exactly that — the API distinguishes
 * a refused application from a suspended one, and the mock never could.
 *
 * The words themselves are in the `status` dictionary (`lib/i18n`), in both languages.
 */
export function vendorStatusMeta(status: AdminVendorStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: t('status.vendor.pending'), tone: 'warning' };
    case 'approved':
      return { label: t('status.vendor.approved'), tone: 'success' };
    case 'suspended':
      return { label: t('status.vendor.suspended'), tone: 'destructive' };
    // Terminal, unlike a suspension — worth a distinct label so a reviewer can
    // see at a glance that there is no way back from this one.
    case 'rejected':
      return { label: t('status.vendor.rejected'), tone: 'destructive' };
  }
}

export function courierStatusMeta(status: AdminCourierStatus): { label: string; tone: BadgeTone } {
  return vendorStatusMeta(status);
}

export function orderStatusMeta(status: OrderStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: t('status.order.pending'), tone: 'neutral' };
    case 'confirmed':
      return { label: t('status.order.confirmed'), tone: 'primary' };
    case 'preparing':
      return { label: t('status.order.preparing'), tone: 'warning' };
    case 'ready':
      return { label: t('status.order.ready'), tone: 'secondary' };
    case 'out_for_delivery':
      return { label: t('status.order.out_for_delivery'), tone: 'primary' };
    case 'delivered':
      return { label: t('status.order.delivered'), tone: 'success' };
    case 'cancelled':
      return { label: t('status.order.cancelled'), tone: 'destructive' };
  }
}

export function disputeStatusMeta(status: AdminDisputeStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'open':
      return { label: t('status.dispute.open'), tone: 'destructive' };
    case 'answered':
      return { label: t('status.dispute.answered'), tone: 'warning' };
    case 'resolved':
      return { label: t('status.dispute.resolved'), tone: 'success' };
    case 'rejected':
      return { label: t('status.dispute.rejected'), tone: 'neutral' };
  }
}

export function courierIssueStatusMeta(status: CourierIssueStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'open':
      return { label: t('status.courierIssue.open'), tone: 'destructive' };
    case 'resolved':
      return { label: t('status.courierIssue.resolved'), tone: 'success' };
  }
}

export const DISPUTE_REASON_LABELS: Record<string, string> = lazy(() => ({
  missing_items: t('status.disputeReason.missing_items'),
  wrong_order: t('status.disputeReason.wrong_order'),
  quality: t('status.disputeReason.quality'),
  late: t('status.disputeReason.late'),
  other: t('status.disputeReason.other'),
}));

/** Who cancelled an order. `unknown` is an order cancelled before the app recorded it. */
export const CANCELLED_BY_LABELS: Record<'customer' | 'merchant' | 'admin' | 'system' | 'unknown', string> = lazy(() => ({
  customer: t('status.cancelledBy.customer'),
  merchant: t('status.cancelledBy.merchant'),
  admin: t('status.cancelledBy.admin'),
  system: t('status.cancelledBy.system'),
  unknown: t('status.cancelledBy.unknown'),
}));

/** The shopper's reasons, plus the system's. An unknown code is shown as it is. */
export const CANCEL_REASON_LABELS: Record<string, string> = lazy(() => ({
  changed_mind: t('status.cancelReason.changed_mind'),
  ordered_by_mistake: t('status.cancelReason.ordered_by_mistake'),
  wrong_address: t('status.cancelReason.wrong_address'),
  wrong_items: t('status.cancelReason.wrong_items'),
  too_long: t('status.cancelReason.too_long'),
  other: t('status.cancelReason.other'),
  no_courier: t('status.cancelReason.no_courier'),
  shop_no_response: t('status.cancelReason.shop_no_response'),
}));

/** Why a courier no longer has an order. `order_cancelled` is written by a cancellation, not chosen. */
export const RELEASE_REASON_LABELS: Record<string, string> = lazy(() => ({
  vehicle_problem: t('status.releaseReason.vehicle_problem'),
  too_far: t('status.releaseReason.too_far'),
  shop_delay: t('status.releaseReason.shop_delay'),
  personal: t('status.releaseReason.personal'),
  other: t('status.releaseReason.other'),
  order_cancelled: t('status.releaseReason.order_cancelled'),
  no_show: t('status.releaseReason.no_show'),
}));

export const COURIER_ISSUE_REASON_LABELS: Record<string, string> = lazy(() => ({
  customer_absent: t('status.courierIssueReason.customer_absent'),
  wrong_address: t('status.courierIssueReason.wrong_address'),
  access_problem: t('status.courierIssueReason.access_problem'),
  shop_not_ready: t('status.courierIssueReason.shop_not_ready'),
  order_incomplete: t('status.courierIssueReason.order_incomplete'),
  other: t('status.courierIssueReason.other'),
}));

export const VEHICLE_LABELS: Record<string, string> = lazy(() => ({
  bike: t('status.vehicle.bike'),
  scooter: t('status.vehicle.scooter'),
  car: t('status.vehicle.car'),
}));
