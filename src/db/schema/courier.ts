import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { profiles } from './identity.js';
import { orders } from './orders.js';
import { vendors } from './catalog.js';

export const vehicleTypeEnum = pgEnum('vehicle_type', ['bike', 'scooter', 'car']);
/** `suspended` is real here — only Phase 8's admin API is entitled to set it. */
/** `rejected` is distinct from `suspended` for the reason `vendorStatusEnum` gives. */
export const courierStatusEnum = pgEnum('courier_status', ['pending', 'approved', 'suspended', 'rejected']);
export const dispatchOfferOutcomeEnum = pgEnum('dispatch_offer_outcome', ['accepted', 'declined', 'expired']);

export const couriers = pgTable(
  'couriers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references((): AnyPgColumn => profiles.id),
    fullName: text('full_name').notNull(),
    photoUrl: text('photo_url'),
    phone: text('phone').notNull(),
    vehicle: vehicleTypeEnum('vehicle').notNull(),
    /** Absent for a bike. */
    plate: text('plate'),
    licenceNumber: text('licence_number'),
    city: text('city').notNull(),
    postalCode: text('postal_code'),
    /** Idle "home" position — the origin every dispatch offer is ranked from. */
    baseLat: doublePrecision('base_lat').notNull(),
    baseLng: doublePrecision('base_lng').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }).notNull().default('0'),
    deliveryCount: integer('delivery_count').notNull().default(0),
    status: courierStatusEnum('status').notNull().default('pending'),
    /** Why the file is where it is — required of every rejection and suspension. See `vendors.statusReason`. */
    statusReason: text('status_reason'),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => profiles.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /**
     * On shift, and therefore offerable. Distinct from `status`, which is the
     * platform's standing judgement on the file — an approved courier who is
     * asleep must not be offered a run, and the mock had nowhere to say so
     * (`useDispatchStore` kept "online" in client memory, which meant the
     * dispatcher only knew about couriers whose phone was awake and
     * foregrounded).
     */
    isOnline: boolean('is_online').notNull().default(false),
    /**
     * Last contact. A courier whose app was killed mid-shift never sends "going
     * offline", so `is_online` alone would strand runs on a phone in someone's
     * pocket; the dispatcher additionally requires a recent heartbeat.
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('couriers_status_idx').on(t.status),
    // One courier file per account, for the same reason a merchant gets one
    // shop: `courierForUser` resolves it with `limit(1)`, and a second row
    // would make every later write land nondeterministically.
    uniqueIndex('couriers_user_id_unique').on(t.userId),
    // The dispatcher's own query: approved *and* on shift, every few seconds.
    index('couriers_dispatchable_idx').on(t.status, t.isOnline),
  ]
);

/** 1:1 with `couriers`. Absent for a bike; required of moto/voiture at registration. */
export const courierInsurance = pgTable('courier_insurance', {
  courierId: uuid('courier_id').primaryKey().references(() => couriers.id, { onDelete: 'cascade' }),
  insurerName: text('insurer_name').notNull(),
  policyNumber: text('policy_number').notNull(),
  /** "MM/AAAA", as an insurer prints it. */
  expiry: text('expiry').notNull(),
});

/**
 * Stripe Connect Express account per courier, 1:1. Deliberately **not** a
 * bank transit/account column — see docs/BACKEND-BUILD-PHASES.md, Phase 7:
 * raw bank details are never this database's to hold, Stripe collects them
 * during Connect onboarding instead.
 */
export const courierPayouts = pgTable('courier_payouts', {
  courierId: uuid('courier_id').primaryKey().references(() => couriers.id, { onDelete: 'cascade' }),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  status: text('status').notNull().default('not_started'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Live GPS pings while `out_for_delivery` (Phase 5) — replaces the mock's
 * `lib/courierRoute.ts` simulation entirely. High write volume, so a plain
 * append-only log rather than an upsert-in-place row.
 */
export const courierLocations = pgTable(
  'courier_locations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    courierId: uuid('courier_id').notNull().references(() => couriers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    heading: doublePrecision('heading'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('courier_locations_courier_recorded_idx').on(t.courierId, t.recordedAt),
    // Phase 5's "get this order's location pings" for the live tracking map.
    index('courier_locations_order_id_idx').on(t.orderId),
  ]
);

/**
 * Server-side replacement for the mock's `useDispatchStore` — one row per
 * offer made, not just the courier's currently-pending one, so the ranking/
 * expiry history is auditable. See docs/BACKEND-BUILD-PHASES.md, Phase 5.
 */
export const dispatchOffers = pgTable(
  'dispatch_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    courierId: uuid('courier_id').notNull().references(() => couriers.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id),
    offeredAt: timestamp('offered_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    outcome: dispatchOfferOutcomeEnum('outcome'),
    distanceToPickupKm: numeric('distance_to_pickup_km', { precision: 6, scale: 2 }).notNull(),
    distanceToDropoffKm: numeric('distance_to_dropoff_km', { precision: 6, scale: 2 }).notNull(),
    estimatedEarningsCad: numeric('estimated_earnings_cad', { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    index('dispatch_offers_order_id_idx').on(t.orderId),
    index('dispatch_offers_courier_id_idx').on(t.courierId),
    // A courier is offered a given order at most once, ever. This is the
    // server-side form of the mock's `passedOrderIds`: someone who let an offer
    // expire, or declined it, must not be handed the same run again two
    // seconds later by the next dispatch tick. The mock encoded the same rule
    // in its derived offer id, `off_<orderId>_<courierId>`.
    uniqueIndex('dispatch_offers_one_per_order_courier').on(t.orderId, t.courierId),
    // The expiry sweep's own query — every pending offer past its deadline.
    index('dispatch_offers_pending_idx').on(t.expiresAt).where(sql`${t.outcome} is null`),
  ]
);

export const couriersRelations = relations(couriers, ({ one, many }) => ({
  account: one(profiles, { fields: [couriers.userId], references: [profiles.id] }),
  insurance: one(courierInsurance, { fields: [couriers.id], references: [courierInsurance.courierId] }),
  payout: one(courierPayouts, { fields: [couriers.id], references: [courierPayouts.courierId] }),
  locations: many(courierLocations),
  offers: many(dispatchOffers),
}));
