/**
 * Re-exports the platform's real domain types rather than redefining them —
 * this admin app describes the same shops, couriers and orders the mobile
 * app does, from the same `data/types.ts` source of truth (type-only import,
 * erased at compile time, no runtime coupling to the Expo app).
 */
export type {
  ID,
  Address,
  LatLng,
  Category,
  VendorType,
  VendorHours,
  VendorSection,
  VendorStatus,
  ShopRegistration,
  Vendor,
  Product,
  OrderStatus,
  OrderItem,
  OrderStatusEvent,
  DisputeReason,
  CourierIssueReason,
  VehicleType,
  CourierStatus,
  CourierInsurance,
  CourierPayout,
  Courier,
  OrderDelivery,
  Order,
  UserRole,
  User,
  LoyaltyReason,
  LoyaltyTransaction,
} from '../../data/types';

// ── Admin-only extensions ───────────────────────────────────────────────────
// The mobile app's `OrderDispute`/`CourierIssue` model only what a shopper and
// a merchant can honestly do (report / reply) — resolution belongs to the
// back-office, which didn't exist until now. These extend the concept for
// this surface only, without touching the shared mobile type.

import type {
  CourierIssueReason,
  CourierStatus,
  DisputeReason,
  ID,
  OrderStatus,
  VehicleType,
  VendorStatus,
  VendorType,
} from '../../data/types';

export type AdminDisputeStatus = 'open' | 'answered' | 'resolved' | 'rejected';

export interface AdminDispute {
  id: ID;
  orderId: ID;
  vendorId: ID;
  vendorName: string;
  customerId: ID;
  customerName: string;
  reason: DisputeReason;
  message: string;
  openedAt: string;
  status: AdminDisputeStatus;
  merchantReply?: string;
  answeredAt?: string;
  resolutionNote?: string;
  resolvedAt?: string;
}

export type CourierIssueStatus = 'open' | 'resolved';

export interface AdminCourierIssue {
  id: ID;
  orderId: ID;
  courierId: ID;
  courierName: string;
  vendorId: ID;
  vendorName: string;
  reason: CourierIssueReason;
  message: string;
  at: string;
  status: CourierIssueStatus;
  resolvedAt?: string;
}

/**
 * The API models a **rejected** file as its own state; `data/types.ts`'s
 * `VendorStatus`/`CourierStatus` unions stop at `'suspended'` because the
 * mobile app has no back office and never needed the distinction — a shop was
 * either live or not.
 *
 * Widened here rather than in `data/types.ts`, which is the Expo app's source
 * of truth and still entirely mock-driven; changing it would ripple through the
 * whole mobile codebase for no benefit there.
 *
 * The difference is real: rejected is terminal (a rejected file cannot be
 * approved later), suspended is reversible.
 */
export type AdminVendorStatus = VendorStatus | 'rejected';
export type AdminCourierStatus = CourierStatus | 'rejected';

/**
 * One row of `GET /admin/orders`.
 *
 * `vendorName` and `courierName` arrive joined server-side — the mock resolved
 * shop names client-side by fetching every vendor, which stops being correct as
 * soon as the list is paginated.
 */
export interface AdminOrderListItem {
  id: ID;
  status: OrderStatus;
  createdAt: string;
  subtotalCad: number;
  totalCad: number;
  customerId: ID;
  customerName: string | null;
  vendorId: ID;
  vendorName: string;
  vendorType: VendorType;
  courierName: string | null;
  refundedAt: string | null;
  refundAmountCad: number | null;
  /** Flags, not embedded objects — the table only needs to know whether to badge the row. */
  hasDispute: boolean;
  hasCourierIssue: boolean;
}

/** `GET /admin/orders/:id`. Grouped so the detail page's cards map onto it directly. */
export interface AdminOrderDetail {
  id: ID;
  status: OrderStatus;
  createdAt: string;
  stripePaymentIntentId: string | null;
  customer: { id: ID; fullName: string; avatarUrl: string | null; memberSince: string | null } | null;
  customerName: string | null;
  vendor: {
    id: ID;
    name: string;
    slug: string;
    vendorType: VendorType;
    city: string;
    addressStreet: string;
    addressPostalCode: string;
  };
  items: { id: ID; productId: ID; name: string; qty: number; unitPriceCad: number; lineTotalCad: number }[];
  totals: {
    subtotalCad: number;
    gstCad: number;
    qstCad: number;
    deliveryFeeCad: number;
    pointsRedeemed: number | null;
    pointsDiscountCad: number | null;
    couponCode: string | null;
    couponDiscountCad: number | null;
    totalCad: number;
  };
  refund: { refundedAt: string; refundAmountCad: number | null; stripeRefundId: string | null; refundReason: string | null } | null;
  deliveryAddress: { label: string; street: string; city: string; postalCode: string; lat: number; lng: number };
  statusHistory: { status: OrderStatus; at: string }[];
  delivery: {
    courier: { id: ID; fullName: string; phone: string; vehicle: VehicleType } | null;
    acceptedAt: string;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    pickupEtaMin: number;
    dropoffEtaMin: number;
    distanceKm: number;
    tipCad: number;
    earningsCad: number;
    paidOutAt: string | null;
    proof: { method: string; imagePath: string | null; note: string | null; at: string } | null;
  } | null;
  dispute: {
    reason: DisputeReason;
    message: string;
    openedAt: string;
    status: AdminDisputeStatus;
    merchantReply: string | null;
    answeredAt: string | null;
    resolvedAt: string | null;
  } | null;
  courierIssue: { reason: CourierIssueReason; message: string; at: string; status: CourierIssueStatus; resolvedAt: string | null } | null;
}

export interface PlatformSettings {
  commissionRate: number;
  monthlySubscriptionCad: number;
  pointsPerCad: number;
  pointsPerCadRedeemed: number;
  maxRedemptionShare: number;
  pointsExpiryMonths: number;
  referralRewardPoints: number;
  referralMinFirstOrderCad: number;
  doublePointsActive: boolean;
}
