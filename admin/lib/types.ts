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

import type { DisputeReason, CourierIssueReason, ID } from '../../data/types';

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
