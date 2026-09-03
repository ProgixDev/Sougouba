import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { authUsers } from './auth.js';
import { vendors } from './catalog.js';
import { couriers } from './courier.js';
import { products } from './catalog.js';

/**
 * `admin` exists here — the database's own idea of who can sign in — even
 * though the mobile app's `UserRole` union never grows a fourth value.
 * Nobody signs up as `admin` through the consumer app; the row is created
 * directly against this table for whoever runs the (separate) admin web app.
 * See docs/BACKEND-BUILD-PHASES.md, Phase 8.
 */
export const roleEnum = pgEnum('role', ['customer', 'business', 'courier', 'admin']);

/**
 * 1:1 with `auth.users`, created by a Postgres trigger on insert (Phase 1).
 * `role` starts null, exactly like the mock — a signed-up account with no
 * role yet is a real, reachable state, not an edge case.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  avatarUrl: text('avatar_url'),
  memberSince: timestamp('member_since', { withTimezone: true }).notNull().defaultNow(),
  role: roleEnum('role'),
  vendorId: uuid('vendor_id').references((): AnyPgColumn => vendors.id, { onDelete: 'set null' }),
  courierId: uuid('courier_id').references((): AnyPgColumn => couriers.id, { onDelete: 'set null' }),
  /** Id of the referring account — set once at sign-up, never rewritten. See `data/loyalty.ts` in the mobile app for the reward this feeds. */
  referredBy: uuid('referred_by').references((): AnyPgColumn => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    street: text('street').notNull(),
    city: text('city').notNull(),
    postalCode: text('postal_code').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('addresses_profile_id_idx').on(t.profileId),
    // At most one default per profile — DB-enforced, where the mock enforced it in `account/addresses.tsx`'s JS.
    uniqueIndex('addresses_one_default_per_profile')
      .on(t.profileId)
      .where(sql`${t.isDefault} = true`),
  ]
);

export const favoriteProducts = pgTable(
  'favorite_products',
  {
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.productId] })]
);

export const favoriteVendors = pgTable(
  'favorite_vendors',
  {
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.vendorId] })]
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  vendor: one(vendors, { fields: [profiles.vendorId], references: [vendors.id] }),
  courier: one(couriers, { fields: [profiles.courierId], references: [couriers.id] }),
  referrer: one(profiles, { fields: [profiles.referredBy], references: [profiles.id] }),
  addresses: many(addresses),
  favoriteProducts: many(favoriteProducts),
  favoriteVendors: many(favoriteVendors),
}));
