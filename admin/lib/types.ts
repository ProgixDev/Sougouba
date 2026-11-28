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
  LatLng,
  OrderStatus,
  UserRole,
  VehicleType,
  VendorStatus,
  VendorType,
} from '../../data/types';

export type AdminDisputeStatus = 'open' | 'answered' | 'resolved' | 'rejected';

/**
 * A dispute, as `GET /admin/disputes` returns it.
 *
 * **Keyed by `orderId`** — the `disputes` table's primary key is the order, so
 * there is no separate `id`; the mock invented one. The resolution note is
 * written into `merchantReply` rather than a `resolutionNote` field of its own,
 * which is why that field is gone too.
 */
export interface AdminDispute {
  orderId: ID;
  reason: DisputeReason;
  message: string;
  status: AdminDisputeStatus;
  openedAt: string;
  merchantReply: string | null;
  answeredAt: string | null;
  resolvedAt: string | null;
  /** Order context, joined server-side so the queue needs no second request. */
  orderTotalCad: number;
  orderStatus: OrderStatus;
  orderCreatedAt: string;
  refundedAt: string | null;
  refundAmountCad: number | null;
  customerName: string | null;
  vendorName: string;
}

export type CourierIssueStatus = 'open' | 'resolved';

/** Keyed by `orderId` for the same reason as `AdminDispute`. */
export interface AdminCourierIssue {
  orderId: ID;
  reason: CourierIssueReason;
  message: string;
  at: string;
  status: CourierIssueStatus;
  resolvedAt: string | null;
  /** Order context, joined server-side. */
  orderStatus: OrderStatus;
  deliveryAddressStreet: string;
  deliveryAddressCity: string;
  vendorName: string;
  /** Null when the issue was reported before a courier accepted the run. */
  courierId: ID | null;
  courierName: string | null;
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
  /**
   * The shopper's receipt: its number (`R-000123`) and when it was last emailed.
   * Absent from an API older than the receipts feature; `number` is null until
   * migration 0051 is applied, `emailedAt` until an email has gone out.
   */
  receipt?: { number: string | null; emailedAt: string | null };
  /**
   * Who cancelled the order and why; null unless it is cancelled. `by` is null
   * on an order cancelled before this was recorded. `reason` is a code (the
   * shopper's choice, or `no_courier`); `note` is free text — the shopper's
   * words, or the reason a colleague wrote. Absent from an older API.
   */
  cancellation?: {
    at: string | null;
    by: 'customer' | 'merchant' | 'admin' | 'system' | null;
    byName: string | null;
    reason: string | null;
    note: string | null;
  } | null;
  /** Couriers who held the order and no longer do, oldest first. Absent from an older API. */
  releases?: {
    courier: { id: ID; fullName: string } | null;
    reason: string;
    note: string | null;
    acceptedAt: string;
    pickedUpAt: string | null;
    releasedAt: string;
  }[];
  deliveryAddress: { label: string; street: string; city: string; postalCode: string; lat: number; lng: number };
  /** Copied from the address at checkout; absent from an API older than migration 0050. */
  deliveryInstructions?: { unit: string | null; doorCode: string | null; notes: string | null; dropoff: 'hand' | 'door' };
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

/** One row of `GET /admin/vendors` — the approval queue. */
export interface AdminVendorListItem {
  id: ID;
  name: string;
  slug: string;
  vendorType: VendorType;
  city: string;
  addressStreet: string;
  addressPostalCode: string;
  status: AdminVendorStatus;
  /** Why it was rejected or suspended. Replaces the mock's separate notes map. */
  statusReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  ownerName: string;
  /** Registration paperwork — null for a shop predating the flow. */
  legalName: string | null;
  neq: string | null;
  contactName: string | null;
  contactPhone: string | null;
  mapaqNumber: string | null;
  submittedAt: string | null;
}

/** `GET /admin/vendors/:id`. */
export interface AdminVendorDetail {
  id: ID;
  slug: string;
  name: string;
  vendorType: VendorType;
  specialtyFr: string;
  logoUrl: string | null;
  coverUrl: string | null;
  city: string;
  neighborhood: string;
  address: { street: string; city: string; postalCode: string; lat: number; lng: number };
  rating: number;
  reviewCount: number;
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  status: AdminVendorStatus;
  statusReason: string | null;
  reviewedAt: string | null;
  reviewer: { id: ID; fullName: string } | null;
  owner: { id: ID; fullName: string; email: string | null; avatarUrl: string | null; memberSince: string };
  /**
   * The monthly subscription (CDC addendum §05), as last recorded from Stripe.
   * Absent from an API older than the feature. `priceCad` is what the shop is
   * billed, null until it has subscribed.
   */
  subscription?: {
    status: 'inactive' | 'active' | 'past_due' | 'canceled';
    currentPeriodEnd: string | null;
    cancelAt: string | null;
    priceCad: number | null;
    /** True while a shop must be subscribed to sell. Absent before migration 0062. */
    required?: boolean;
    /** A failed renewal still within its grace: when the shop goes offline unless it is settled. */
    offlineAt?: string | null;
  };
  /** The fields added with the client's 2026-09-27 list are null on files submitted before it. */
  registration: {
    legalName: string | null;
    neq: string | null;
    gstNumber: string | null;
    qstNumber: string | null;
    contactName: string;
    contactPhone: string;
    mapaqNumber: string | null;
    /** `YYYY-MM-DD`. */
    mapaqExpiresOn: string | null;
    payoutMethod: 'stripe' | 'bank_document' | null;
    submittedAt: string | null;
    /** `url` is signed for ten minutes — reload the page for a fresh one. Null if signing failed. */
    documents: { kind: 'id' | 'business_number' | 'mapaq' | 'bank'; path: string; url: string | null }[];
  } | null;
  categories: { id: ID; slug: string; nameFr: string }[];
  hours: { day: number; open: string; close: string; closed: boolean }[];
  sections: { id: ID; nameFr: string; position: number }[];
  stats: { productCount: number; orderCount: number; revenueCad: number; lastOrderAt: string | null; openDisputes: number };
  createdAt: string;
  updatedAt: string;
}

/** One row of `GET /admin/couriers`. */
export interface AdminCourierListItem {
  id: ID;
  fullName: string;
  /** The courier's own profile photo. Absent from an API that predates it. */
  avatarUrl?: string | null;
  phone: string;
  vehicle: VehicleType;
  plate: string | null;
  licenceNumber: string | null;
  city: string;
  status: AdminCourierStatus;
  statusReason: string | null;
  reviewedAt: string | null;
  isOnline: boolean;
  deliveryCount: number;
  joinedAt: string;
  insurerName: string | null;
  policyNumber: string | null;
  /** Text in `MM/AAAA` form, not a date. */
  insuranceExpiry: string | null;
}

/** `GET /admin/couriers/:id`. */
export interface AdminCourierDetail {
  id: ID;
  userId: ID;
  fullName: string;
  photoUrl: string | null;
  phone: string;
  vehicle: VehicleType;
  plate: string | null;
  licenceNumber: string | null;
  city: string;
  postalCode: string | null;
  base: LatLng;
  rating: number;
  deliveryCount: number;
  status: AdminCourierStatus;
  statusReason: string | null;
  reviewedAt: string | null;
  reviewer: { id: ID; fullName: string } | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  joinedAt: string;
  account: { id: ID; fullName: string; email: string | null; avatarUrl: string | null; memberSince: string };
  /** Null for a bike courier — insurance is not required for one. */
  insurance: { insurerName: string; policyNumber: string; expiry: string } | null;
  /**
   * ⚠️ A Stripe Connect account, **not** bank details. The mobile app's
   * `CourierPayout` (`{ bankId, transit, account }`) has no equivalent here —
   * the database deliberately holds no account numbers.
   */
  payout: { stripeConnectAccountId: string | null; status: string; updatedAt: string | null } | null;
  stats: {
    runCount: number;
    deliveredCount: number;
    earningsTotalCad: number;
    unpaidCad: number;
    tipsTotalCad: number;
    avgDistanceKm: number;
    lastDeliveredAt: string | null;
    openIssues: number;
  };
}

/** One row of `GET /admin/users`. */
export interface AdminUserListItem {
  id: ID;
  fullName: string;
  /** From `auth.users`, joined server-side. Null for a phone-only signup. */
  email: string | null;
  role: UserRole | 'admin' | null;
  memberSince: string;
  vendorId: ID | null;
  courierId: ID | null;
  lastSignInAt: string | null;
  /** The profile photo, when the person has set one. Absent from an API that predates it. */
  avatarUrl?: string | null;
}

/** `GET /admin/users/:id`. */
export interface AdminUserDetail {
  id: ID;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  memberSince: string;
  role: UserRole | 'admin' | null;
  auth: { emailConfirmedAt: string | null; lastSignInAt: string | null; phone: string | null; bannedUntil: string | null };
  vendor: { id: ID; name: string; slug: string; status: AdminVendorStatus; vendorType: VendorType } | null;
  courier: { id: ID; fullName: string; status: AdminCourierStatus; vehicle: VehicleType; isOnline: boolean } | null;
  referredBy: { id: ID; fullName: string } | null;
  referralCount: number;
  addresses: { id: ID; label: string; street: string; city: string; postalCode: string; lat: number; lng: number; isDefault: boolean }[];
  activity: {
    /** Excludes cancelled orders; `recentOrders` below does not. */
    orderCount: number;
    lifetimeSpendCad: number;
    lastOrderAt: string | null;
    recentOrders: { id: ID; status: OrderStatus; totalCad: number; createdAt: string; vendorName: string }[];
  };
}

export interface PlatformSettings {
  commissionRate: number;
  monthlySubscriptionCad: number;
  /**
   * Whether a shop must have its subscription in order to sell, and how many
   * days it keeps selling after a renewal fails. Absent from an API or a
   * database older than migration 0062.
   */
  subscriptionRequired?: boolean;
  subscriptionGraceDays?: number;
  pointsPerCad: number;
  pointsPerCadRedeemed: number;
  maxRedemptionShare: number;
  pointsExpiryMonths: number;
  referralRewardPoints: number;
  referralMinFirstOrderCad: number;
  doublePointsActive: boolean;
  /**
   * How long a packed order may wait for a courier, in minutes: before staff
   * are told, and before it is cancelled and refunded (0 = never automatically).
   * Absent from an API or a database older than migration 0054.
   */
  noCourierAlertMin?: number;
  noCourierCancelMin?: number;
  /**
   * How long an order may wait for the shop to accept it, in minutes: before the
   * shop is reminded (0 = no reminder) and before the order is cancelled and
   * refunded (0 = never automatically). Absent before migration 0055.
   */
  shopConfirmRemindMin?: number;
  shopConfirmCancelMin?: number;
  /**
   * How late a courier may be at the shop, in minutes past the pickup time
   * estimated when they accepted: before they are reminded (0 = no reminder)
   * and before the run is taken back (0 = never). Absent before migration 0056.
   */
  courierLateRemindMin?: number;
  courierLateReleaseMin?: number;
}
