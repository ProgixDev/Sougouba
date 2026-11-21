import type { Category, Product, Vendor } from '../types';

/**
 * The API's row shapes → the app's domain types.
 *
 * Two differences are real and neither side is wrong:
 *
 * 1. **`specialtyFr` vs `specialty`.** The database holds one French string;
 *    the app models a `LocalizedText` because the back office will eventually
 *    carry translations. `{ fr }` is the honest lift — it says "French is all
 *    we have" rather than pretending a second language exists.
 * 2. **The address arrives nested.** The database stores `address_street`/
 *    `address_lat`/… flat, but the API's own mapper nests them as `address` before
 *    they leave the server. An earlier version of this file read the flat names,
 *    got `undefined` for all five, and every shop page showed ", Montréal" and
 *    priced delivery from nowhere — the default $2.99 for every shop.
 */

type CategoryRow = {
  id: string;
  slug: string;
  nameFr: string;
  shortNameFr: string;
  icon: string;
  colorToken: string;
};

/**
 * Same lift as `specialty`: the API stores `name_fr`/`short_name_fr`, the app
 * reads `LocalizedText`. Passing the row through unmapped left `name` and
 * `shortName` undefined, and `L(category.shortName)` then threw on every screen
 * that draws a category chip — the Search tab crashed the app on open.
 */
export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: { fr: row.nameFr },
    shortName: { fr: row.shortNameFr },
    icon: row.icon,
    colorToken: row.colorToken,
  };
}

type VendorRow = {
  id: string;
  slug: string;
  name: string;
  vendorType: Vendor['vendorType'];
  specialtyFr: string;
  logoUrl: string;
  coverUrl: string;
  categoryIds?: string[];
  city: string;
  neighborhood: string;
  address: { street: string; city: string; postalCode: string; lat: number; lng: number };
  rating: number | string;
  reviewCount: number;
  deliveryEtaMin: number;
  isHalalCertified: boolean;
  hours?: { day: number; open: string; close: string; closed?: boolean }[];
  sections?: { id: string; nameFr: string; position: number }[];
  ownerId: string;
  status: Vendor['status'];
};

export function toVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    vendorType: row.vendorType,
    specialty: { fr: row.specialtyFr },
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    categoryIds: row.categoryIds ?? [],
    city: row.city,
    neighborhood: row.neighborhood,
    address: {
      street: row.address.street,
      city: row.address.city,
      postalCode: row.address.postalCode,
      lat: row.address.lat,
      lng: row.address.lng,
    } as Vendor['address'],
    // `numeric` reaches JSON as a string often enough that coercing here is
    // cheaper than finding the one screen that concatenated a rating.
    rating: Number(row.rating),
    reviewCount: row.reviewCount,
    deliveryEtaMin: row.deliveryEtaMin,
    isHalalCertified: row.isHalalCertified,
    // `closed` carried through: dropping it made a shop's day off read as open.
    hours: (row.hours ?? []).map((h) => ({ day: h.day, open: h.open, close: h.close, closed: h.closed })),
    sections: (row.sections ?? []).map((s) => ({
      id: s.id,
      vendorId: row.id,
      name: { fr: s.nameFr },
      position: s.position,
    })) as Vendor['sections'],
    ownerId: row.ownerId,
    status: row.status,
  };
}

type ProductRow = {
  id: string;
  vendorId: string;
  categoryId: string;
  sectionId: string;
  name: string;
  description: string;
  priceCad: number | string;
  compareAtPriceCad?: number | string | null;
  imageUrl: string | null;
  stockQty: number;
  isAvailable: boolean;
  tags?: string[];
  /** Nested by the API when set, absent otherwise — never flat columns. */
  nutrition?: { calories: number; proteinG: number; fatG: number; weightG: number };
  /** Only on the merchant's own reads: the back office hid this product. */
  hiddenByAdmin?: { at: string; reason: string | null };
};

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    vendorId: row.vendorId,
    categoryId: row.categoryId,
    sectionId: row.sectionId,
    name: row.name,
    description: row.description,
    priceCad: Number(row.priceCad),
    ...(row.compareAtPriceCad != null ? { compareAtPriceCad: Number(row.compareAtPriceCad) } : {}),
    imageUrl: row.imageUrl ?? '',
    // The API sends all four or none (it stores them as a set), already nested.
    // Reading flat `nutritionCalories`-style names here dropped every block.
    ...(row.nutrition
      ? {
          nutrition: {
            calories: Number(row.nutrition.calories),
            proteinG: Number(row.nutrition.proteinG),
            fatG: Number(row.nutrition.fatG),
            weightG: Number(row.nutrition.weightG),
          },
        }
      : {}),
    stockQty: row.stockQty,
    isAvailable: row.isAvailable,
    tags: row.tags ?? [],
    ...(row.hiddenByAdmin ? { hiddenByAdmin: row.hiddenByAdmin } : {}),
  } as Product;
}
