import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { profiles } from './identity.js';

/** Boulangerie was withdrawn from v1 scope (CDC addendum §01) — only these two remain. */
export const vendorTypeEnum = pgEnum('vendor_type', ['grocery', 'restaurant']);

/**
 * Same three positions a courier's file has, and for the same reason: a
 * human sits between "someone applied" and "the shop is live" (CDC addendum
 * §02). `suspended` is real here, unlike the mock — Phase 8 is the first
 * thing entitled to set it.
 */
/**
 * `rejected` is new in Phase 8 and is **not** the same as `suspended`.
 *
 * The mock had three values because the app only ever needed three: an
 * application waiting, a shop trading, and a status nothing could reach. The
 * CDC asks an administrator to "approve or reject" a file after reading the
 * paperwork, and folding a rejection into `suspended` would say a shop that was
 * never admitted had been taken offline — which is what a merchant reads on
 * their own screen, and what an auditor reads six months later.
 */
export const vendorStatusEnum = pgEnum('vendor_status', ['pending', 'approved', 'suspended', 'rejected']);

/** Platform taxonomy — what search and the home grid filter on. Seeded; admin-editable later. */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nameFr: text('name_fr').notNull(),
  shortNameFr: text('short_name_fr').notNull(),
  icon: text('icon').notNull(),
  colorToken: text('color_token').notNull(),
});

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    vendorType: vendorTypeEnum('vendor_type').notNull(),
    specialtyFr: text('specialty_fr').notNull(),
    logoUrl: text('logo_url'),
    coverUrl: text('cover_url'),
    city: text('city').notNull(),
    neighborhood: text('neighborhood').notNull(),
    addressStreet: text('address_street').notNull(),
    addressPostalCode: text('address_postal_code').notNull(),
    addressLat: doublePrecision('address_lat').notNull(),
    addressLng: doublePrecision('address_lng').notNull(),
    rating: numeric('rating', { precision: 2, scale: 1 }).notNull().default('0'),
    reviewCount: integer('review_count').notNull().default(0),
    deliveryEtaMin: integer('delivery_eta_min').notNull(),
    isHalalCertified: boolean('is_halal_certified').notNull().default(false),
    ownerId: uuid('owner_id').notNull().references((): AnyPgColumn => profiles.id),
    status: vendorStatusEnum('status').notNull().default('pending'),
    /**
     * Why the file is where it is — required of every rejection and suspension.
     * A merchant told only "rejected" has nothing to fix and nothing to appeal,
     * and the administrator who decided it will not remember by the time they
     * are asked.
     */
    statusReason: text('status_reason'),
    reviewedBy: uuid('reviewed_by').references((): AnyPgColumn => profiles.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // **Unique**, not merely indexed: one shop per account is a real rule that
    // `apply` already refuses to break, but enforcing it only in application
    // code left a double-tapped registration able to create two rows — the
    // check ran before the transaction, and nothing in the database disagreed.
    // `ownedVendorId` then resolves a merchant's shop with `limit(1)` and no
    // ordering, so a second row would have made later product writes and shop
    // edits land in either shop, nondeterministically, request to request.
    uniqueIndex('vendors_owner_id_unique').on(t.ownerId),
    // The customer-facing browse query is always `status = 'approved'` — see
    // `data/api/vendors.ts`'s `live()` filter in the mobile app.
    index('vendors_status_idx').on(t.status),
    index('vendors_type_idx').on(t.vendorType),
  ]
);

/** Many-to-many: a vendor can carry several platform categories. */
export const vendorCategories = pgTable(
  'vendor_categories',
  {
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.vendorId, t.categoryId] }),
    // The composite PK covers `vendorId` lookups; this covers the reverse —
    // `getVendorsByCategory`'s browse-by-category query.
    index('vendor_categories_category_id_idx').on(t.categoryId),
  ]
);

/** A merchant's own menu/aisle headings, worded by them — not the platform taxonomy. */
export const vendorSections = pgTable(
  'vendor_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    nameFr: text('name_fr').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('vendor_sections_vendor_id_idx').on(t.vendorId)]
);

export const vendorHours = pgTable(
  'vendor_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    /** 0 = Sunday, matching `Date.getDay()` — see the mobile app's own note on `VendorHours.day`. */
    day: smallint('day').notNull(),
    open: text('open').notNull(),
    close: text('close').notNull(),
    closed: boolean('closed').notNull().default(false),
  },
  (t) => [uniqueIndex('vendor_hours_vendor_day_unique').on(t.vendorId, t.day)]
);

/**
 * The paperwork behind a shop, 1:1 with `vendors`. Document *paths* are new —
 * the mock only ever captured these as plain text fields, never an actual
 * upload (see docs/BACKEND-BUILD-PHASES.md, Phase 2). Paths point into the
 * `merchant-documents` Storage bucket; the exact document list is
 * "Confirm before Phase 0" item #1 — these three are the CDC's own
 * indicative list, not a final schema.
 */
export const vendorRegistrations = pgTable('vendor_registrations', {
  vendorId: uuid('vendor_id').primaryKey().references(() => vendors.id, { onDelete: 'cascade' }),
  neq: text('neq').notNull(),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone').notNull(),
  mapaqNumber: text('mapaq_number'),
  idDocumentPath: text('id_document_path'),
  businessNumberDocumentPath: text('business_number_document_path'),
  mapaqDocumentPath: text('mapaq_document_path'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    /** Platform taxonomy — what search and the home grid filter on. */
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    /** Which of the vendor's own `vendor_sections` this sits under. */
    sectionId: uuid('section_id').notNull().references(() => vendorSections.id),
    name: text('name').notNull(),
    description: text('description').notNull(),
    priceCad: numeric('price_cad', { precision: 10, scale: 2 }).notNull(),
    compareAtPriceCad: numeric('compare_at_price_cad', { precision: 10, scale: 2 }),
    imageUrl: text('image_url'),
    stockQty: integer('stock_qty').notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(true),
    tags: text('tags').array().notNull().default([]),
    nutritionCalories: integer('nutrition_calories'),
    nutritionProteinG: numeric('nutrition_protein_g', { precision: 6, scale: 2 }),
    nutritionFatG: numeric('nutrition_fat_g', { precision: 6, scale: 2 }),
    nutritionWeightG: numeric('nutrition_weight_g', { precision: 6, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_vendor_id_idx').on(t.vendorId),
    index('products_category_id_idx').on(t.categoryId),
  ]
);

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  owner: one(profiles, { fields: [vendors.ownerId], references: [profiles.id] }),
  registration: one(vendorRegistrations, { fields: [vendors.id], references: [vendorRegistrations.vendorId] }),
  sections: many(vendorSections),
  hours: many(vendorHours),
  categories: many(vendorCategories),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  vendor: one(vendors, { fields: [products.vendorId], references: [vendors.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  section: one(vendorSections, { fields: [products.sectionId], references: [vendorSections.id] }),
}));
