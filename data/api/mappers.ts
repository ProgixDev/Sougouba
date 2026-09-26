import type { Product, Vendor } from '../types';

/**
 * The API's row shapes → the app's domain types.
 *
 * Two differences are real and neither side is wrong:
 *
 * 1. **`specialtyFr` vs `specialty`.** The database holds one French string;
 *    the app models a `LocalizedText` because the back office will eventually
 *    carry translations. `{ fr }` is the honest lift — it says "French is all
 *    we have" rather than pretending a second language exists.
 * 2. **A flat address vs a nested one.** The API stores
 *    `address_street`/`address_city`/… because an order snapshots them
 *    individually; the app groups them because every screen shows them together.
 */

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
  addressStreet: string;
  addressPostalCode: string;
  addressLat: number;
  addressLng: number;
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
      street: row.addressStreet,
      city: row.city,
      postalCode: row.addressPostalCode,
      lat: row.addressLat,
      lng: row.addressLng,
    } as Vendor['address'],
    // `numeric` reaches JSON as a string often enough that coercing here is
    // cheaper than finding the one screen that concatenated a rating.
    rating: Number(row.rating),
    reviewCount: row.reviewCount,
    deliveryEtaMin: row.deliveryEtaMin,
    isHalalCertified: row.isHalalCertified,
    hours: (row.hours ?? []).map((h) => ({ day: h.day, open: h.open, close: h.close })),
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
  nutritionCalories?: number | null;
  nutritionProteinG?: number | string | null;
  nutritionFatG?: number | string | null;
  nutritionWeightG?: number | string | null;
};

export function toProduct(row: ProductRow): Product {
  // All four or none — a half-set nutrition block would draw the product page's
  // four-column strip with holes in it, which is the reason the API stores them
  // together too.
  const hasNutrition =
    row.nutritionCalories != null &&
    row.nutritionProteinG != null &&
    row.nutritionFatG != null &&
    row.nutritionWeightG != null;

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
    ...(hasNutrition
      ? {
          nutrition: {
            calories: Number(row.nutritionCalories),
            proteinG: Number(row.nutritionProteinG),
            fatG: Number(row.nutritionFatG),
            weightG: Number(row.nutritionWeightG),
          },
        }
      : {}),
    stockQty: row.stockQty,
    isAvailable: row.isAvailable,
    tags: row.tags ?? [],
  } as Product;
}
