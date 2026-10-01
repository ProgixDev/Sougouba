/**
 * Each seeded shop's own shelves — aisles and products — taken from the mobile
 * prototype's catalogue (`data/seed/{vendors,products}.ts` at the repo root),
 * which was written shop by shop: a butcher sells meat, a Senegalese restaurant
 * serves thiéboudienne, every product has its own photo in
 * `assets/images/catalog/`.
 *
 * It replaces `ITEM_BANK`, a single list of fifteen grocery items the seed gave
 * to *every* shop — restaurants included — so all fifteen storefronts showed the
 * same rice, the same palm oil and the same frozen tilapia.
 *
 * The five shops that never shipped in the prototype (in review, suspended or
 * rejected) borrow the shelves of the closest shop that did. They are only seen
 * in the back office's approval queues, but an application reviewed with a
 * butcher's stock under a pastry shop's name is not a credible fixture either.
 */
import { categories as appCategories } from '../../../data/seed/categories.js';
import { products as appProducts } from '../../../data/seed/products.js';
import { vendors as appVendors } from '../../../data/seed/vendors.js';
import { CATEGORY_IDS } from './fixtures.js';

/** Fixture key (`fixtures.ts` VENDORS) → the prototype shop whose shelves it gets. */
const SHELVES_FROM: Record<string, string> = {
  bamako: 'vnd_marche_bamako',
  atlas: 'vnd_epicerie_atlas',
  sahel: 'vnd_boucherie_sahel',
  dakar: 'vnd_saveurs_dakar',
  maghreb: 'vnd_douceurs_maghreb',
  teranga: 'vnd_teranga',
  medina: 'vnd_souk_medina',
  kilimandjaro: 'vnd_kilimandjaro',
  tanit: 'vnd_boulangerie_tanit',
  adjoa: 'vnd_mama_adjoa',
  // Not in the prototype — the nearest shop that is.
  kabylie: 'vnd_epicerie_atlas', // Algerian grocery ← Maghrebi grocery
  abidjan: 'vnd_mama_adjoa', // Ivorian grill ← West African home cooking
  nil: 'vnd_souk_medina', // Egyptian grocery ← spices, couscous, dates
  zanzibar: 'vnd_kilimandjaro', // East African spices ← East African grocery
  casbah: 'vnd_boulangerie_tanit', // Maghrebi caterer ← Maghrebi café
};

/** The prototype's category ids → the API's, through the slug both share. */
const CATEGORY_BY_SLUG: Record<string, string> = {
  'fruits-legumes': CATEGORY_IDS.fruitsLegumes,
  'epices-condiments': CATEGORY_IDS.epicesCondiments,
  'viande-halal': CATEGORY_IDS.viandeHalal,
  boissons: CATEGORY_IDS.boissons,
  'plats-prepares': CATEGORY_IDS.platsPrepares,
  'produits-laitiers': CATEGORY_IDS.produitsLaitiers,
  'cereales-legumineuses': CATEGORY_IDS.cerealesLegumineuses,
  'pains-patisseries': CATEGORY_IDS.painsPatisseries,
};

export interface CatalogueProduct {
  /** Photo file in `assets/images/catalog/`, without `.jpg` — the prototype's product id. */
  image: string;
  name: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  categoryId: string;
  /** Index into the shop's `sections`. */
  section: number;
  stockQty: number;
  isAvailable: boolean;
  tags: string[];
  nutrition: { calories: number; proteinG: number; fatG: number; weightG: number } | null;
}

export interface Catalogue {
  sections: string[];
  products: CatalogueProduct[];
  /** The categories the shop is listed under — the ones its products are in. */
  categoryIds: string[];
}

const toCents = (cad: number) => Math.round(cad * 100);

export function catalogueFor(vendorKey: string): Catalogue {
  const shopId = SHELVES_FROM[vendorKey];
  if (!shopId) throw new Error(`No shelves mapped for shop "${vendorKey}" in catalogue.ts`);
  const shop = appVendors.find((v) => v.id === shopId);
  if (!shop) throw new Error(`Prototype shop "${shopId}" not found in data/seed/vendors.ts`);

  const sectionIds = (shop.sections ?? []).map((s) => s.id);
  const products = appProducts
    .filter((p) => p.vendorId === shopId)
    .map((p): CatalogueProduct => {
      const slug = appCategories.find((c) => c.id === p.categoryId)?.slug;
      const categoryId = slug ? CATEGORY_BY_SLUG[slug] : undefined;
      if (!categoryId) throw new Error(`No API category for "${p.categoryId}" (product ${p.id})`);
      const section = sectionIds.indexOf(p.sectionId);
      if (section < 0) throw new Error(`Product ${p.id} sits in an aisle its shop does not list`);
      return {
        image: p.id,
        name: p.name,
        description: p.description,
        priceCents: toCents(p.priceCad),
        compareAtCents: p.compareAtPriceCad ? toCents(p.compareAtPriceCad) : null,
        categoryId,
        section,
        stockQty: p.stockQty,
        isAvailable: p.isAvailable,
        tags: p.tags ?? [],
        nutrition: p.nutrition ?? null,
      };
    });

  return {
    sections: (shop.sections ?? []).map((s) => s.name.fr),
    products,
    categoryIds: [...new Set(products.map((p) => p.categoryId))],
  };
}

/**
 * Aisle ids start at 50 within a shop's block of 100, so the shelves written
 * here never collide with the seven generic aisles an older seed left behind —
 * the in-place script (`apply-catalogue.ts`) creates these before it retires
 * those.
 */
export const sectionSeedIndex = (vendorIndex: number, position: number) => vendorIndex * 100 + 50 + position;
export const productSeedIndex = (vendorIndex: number, position: number) => vendorIndex * 100 + position;
