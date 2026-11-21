/**
 * DB rows → the shapes the mobile app's `data/types.ts` already declares.
 *
 * The point of matching them is stated in the plan (docs/BACKEND-BUILD-PHASES.md,
 * "Frontend migration strategy"): cutting a domain over should mean swapping the
 * *inside* of `data/api/<domain>.ts` for HTTP calls, not touching the screens.
 * Every field name here is the mobile app's, not the column's.
 *
 * The one job that cannot be skipped is numeric conversion. Postgres `numeric`
 * arrives over `postgres.js` as a **string**, deliberately — it is arbitrary
 * precision and `number` is not. Handing that straight to the app would make
 * `priceCad * qty` string-concatenate ("4.502" for two $4.50 items) and every
 * price comparison collate as text. `numeric` is right for the column and
 * `number` is right for the wire, so the conversion happens here, once.
 */

export interface VendorAddressResponse {
  street: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
}

export interface VendorResponse {
  id: string;
  slug: string;
  name: string;
  vendorType: 'grocery' | 'restaurant';
  specialtyFr: string;
  logoUrl: string;
  coverUrl: string;
  categoryIds: string[];
  city: string;
  neighborhood: string;
  address: VendorAddressResponse;
  rating: number;
  reviewCount: number;
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  hours: { day: number; open: string; close: string; closed: boolean }[];
  sections: { id: string; nameFr: string; position: number }[];
  ownerId: string;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  /** Computed server-side against the shop's posted hours in Montreal time. */
  isOpen: boolean;
}

export interface VendorRow {
  id: string;
  slug: string;
  name: string;
  vendorType: 'grocery' | 'restaurant';
  specialtyFr: string;
  logoUrl: string | null;
  coverUrl: string | null;
  city: string;
  neighborhood: string;
  addressStreet: string;
  addressPostalCode: string;
  addressLat: number;
  addressLng: number;
  rating: string;
  reviewCount: number;
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  ownerId: string;
  status: 'pending' | 'approved' | 'suspended' | 'rejected';
  isOpen: boolean;
}

export function toVendor(
  row: VendorRow,
  parts: {
    categoryIds: string[];
    hours: { day: number; open: string; close: string; closed: boolean }[];
    sections: { id: string; nameFr: string; position: number }[];
  }
): VendorResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    vendorType: row.vendorType,
    specialtyFr: row.specialtyFr,
    // The mobile `Vendor` types these as non-nullable strings and renders ''
    // as "no photography yet" — `CatalogImage` draws a stable tinted
    // placeholder from the row id. Null and '' mean the same thing to it, so
    // the column's null collapses to the app's '' here rather than making
    // every screen handle both.
    logoUrl: row.logoUrl ?? '',
    coverUrl: row.coverUrl ?? '',
    categoryIds: parts.categoryIds,
    city: row.city,
    neighborhood: row.neighborhood,
    address: {
      street: row.addressStreet,
      city: row.city,
      postalCode: row.addressPostalCode,
      lat: row.addressLat,
      lng: row.addressLng,
    },
    rating: Number(row.rating),
    reviewCount: row.reviewCount,
    deliveryEtaMin: row.deliveryEtaMin,
    isHalalCertified: row.isHalalCertified,
    hours: parts.hours,
    sections: parts.sections,
    ownerId: row.ownerId,
    status: row.status,
    isOpen: row.isOpen,
  };
}

export interface ProductResponse {
  id: string;
  vendorId: string;
  categoryId: string;
  sectionId: string;
  name: string;
  description: string;
  priceCad: number;
  compareAtPriceCad?: number;
  imageUrl: string;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
  nutrition?: { calories: number; proteinG: number; fatG: number; weightG: number };
  /**
   * Set when the back office hid the product. Only ever present on the
   * merchant's own reads: every shopper read leaves hidden products out.
   */
  hiddenByAdmin?: { at: string; reason: string | null };
}

export interface ProductRow {
  id: string;
  vendorId: string;
  categoryId: string;
  sectionId: string;
  name: string;
  description: string;
  priceCad: string;
  compareAtPriceCad: string | null;
  imageUrl: string | null;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
  nutritionCalories: number | null;
  nutritionProteinG: string | null;
  nutritionFatG: string | null;
  nutritionWeightG: string | null;
  hiddenAt?: string | null;
  hiddenReason?: string | null;
}

export function toProduct(row: ProductRow): ProductResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    categoryId: row.categoryId,
    sectionId: row.sectionId,
    name: row.name,
    description: row.description,
    priceCad: Number(row.priceCad),
    // Absent, not null — `Product.compareAtPriceCad` is optional in the mobile
    // types and `if (product.compareAtPriceCad)` is how every screen asks
    // "is this on sale".
    ...(row.compareAtPriceCad !== null ? { compareAtPriceCad: Number(row.compareAtPriceCad) } : {}),
    imageUrl: row.imageUrl ?? '',
    stockQty: row.stockQty,
    isAvailable: row.isAvailable,
    tags: row.tags,
    // The four columns are written as a set or not at all (see
    // `nutritionSchema`), so one non-null is enough to know the set is there.
    ...(row.nutritionCalories !== null
      ? {
          nutrition: {
            calories: row.nutritionCalories,
            proteinG: Number(row.nutritionProteinG),
            fatG: Number(row.nutritionFatG),
            weightG: Number(row.nutritionWeightG),
          },
        }
      : {}),
    ...(row.hiddenAt ? { hiddenByAdmin: { at: row.hiddenAt, reason: row.hiddenReason ?? null } } : {}),
  };
}
