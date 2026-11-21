import { z } from 'zod';

import { paginationSchema, queryBool } from './query.dto.js';

// ── browse ──────────────────────────────────────────────────────────────────

/** The four orderings of `lib/productFilters.ts`'s `SortKey`, unchanged. */
export const sortKeySchema = z.enum(['relevance', 'price_asc', 'price_desc', 'name']).default('relevance');

/** The four bands of `lib/productFilters.ts`'s `PriceBand`, unchanged. */
export const priceBandSchema = z.enum(['all', 'under_10', '10_to_20', 'over_20']).default('all');

export type SortKey = z.infer<typeof sortKeySchema>;
export type PriceBand = z.infer<typeof priceBandSchema>;

/**
 * Bounds in CAD; `null` is open-ended on that side. Copied from
 * `lib/productFilters.ts`'s `priceBands` — including the asymmetry, which is
 * load-bearing: the lower bound is inclusive and the upper is *exclusive*
 * (`price >= min && price < max`), so a product at exactly $10.00 lands in
 * "10 $ à 20 $" and never in "Moins de 10 $". Flipping either comparison would
 * make a product appear in two bands or in none.
 */
export const PRICE_BANDS: Record<PriceBand, [number | null, number | null]> = {
  all: [null, null],
  under_10: [null, 10],
  '10_to_20': [10, 20],
  over_20: [20, null],
};

/** Ceiling for `productIdsSchema`. A cart is a handful of lines; a favourites list is tens. */
const MAX_PRODUCT_IDS = 100;

export const productQuerySchema = paginationSchema.extend({
  sort: sortKeySchema,
  priceBand: priceBandSchema,
  /** Only products carrying a struck-through original price. */
  onSale: queryBool,
  inStockOnly: queryBool,
  sectionId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  /** Substring of the name, or of any one tag — the same test `searchProducts` makes. */
  q: z.string().trim().min(1).optional(),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

/** Platform-wide search needs a term; a blank one returns nothing, exactly as the mock does. */
export const productSearchSchema = productQuerySchema.extend({
  q: z.string().trim().min(1, 'Terme de recherche requis'),
  vendorId: z.uuid().optional(),
});

export type ProductSearchQuery = z.infer<typeof productSearchSchema>;

/**
 * Browsing the catalogue platform-wide, with **no search term required**.
 *
 * `productSearchSchema` insists on `q` because a blank platform-wide *search*
 * is meant to return nothing. Browsing is the other half of that: the home
 * screen and a category tap have no term at all. Before this existed the app
 * reached the same answer by listing every shop and then asking each shop for
 * its shelf — one request per shop, so the home screen cost 1 + N requests and
 * got slower with every merchant who signed up. Same filters, same single
 * `product_page` call; `q` is simply optional.
 */
export const productListSchema = productQuerySchema.extend({
  vendorId: z.uuid().optional(),
});

export type ProductListQuery = z.infer<typeof productListSchema>;

/**
 * A known set of product ids, resolved in one request.
 *
 * What the cart, checkout and the favourites list actually want: they already
 * hold ids and need the products behind them. They used to get there by
 * downloading the whole catalogue and filtering it on the device.
 *
 * Comma-separated rather than repeated `ids=` params, because that is what a
 * cart of three lines reads like in a URL. Capped: the ids land in one `in`
 * list, and an unbounded one is a statement someone else gets to size.
 */
export const productIdsSchema = z.object({
  ids: z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    )
    .pipe(
      z
        .array(z.uuid('Identifiant invalide'))
        .min(1, 'Au moins un identifiant')
        .max(MAX_PRODUCT_IDS, `${MAX_PRODUCT_IDS} identifiants maximum`)
    ),
});

export type ProductIdsQuery = z.infer<typeof productIdsSchema>;

// ── merchant writes ─────────────────────────────────────────────────────────

/**
 * `numeric(10,2)` holds up to 99 999 999.99. A value above that is a `22003`
 * from Postgres — an unhandled 500 — where the caller deserves a 400 saying
 * what was wrong. The ceiling is the column's, stated here so the schema
 * refuses what the table could not have stored anyway.
 */
const MAX_MONEY_CAD = 99_999_999.99;

/** Two decimals, because the column has two: 4.999 would round on the way in and the merchant would be told they saved something they didn't. */
const hasAtMostTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;

const money = (message: string, { allowZero = false } = {}) =>
  z
    .number()
    .refine((n) => Number.isFinite(n), message)
    .refine((n) => (allowZero ? n >= 0 : n > 0), message)
    .refine((n) => n <= MAX_MONEY_CAD, 'Montant trop élevé')
    .refine(hasAtMostTwoDecimals, 'Deux décimales maximum');

/**
 * Nutrition is all-or-nothing.
 *
 * The mobile form models this as a `hasNutrition` checkbox plus four optional
 * fields, cross-checked in a `superRefine` — because a form needs somewhere to
 * hang the "ticked but left blank" error. JSON doesn't: a nested object that is
 * either absent or complete says the same thing with no flag to keep in sync.
 * The reason for the rule is unchanged (`lib/validation/product.ts`): a
 * half-filled set would draw the product page's four-column strip with holes
 * in it.
 */
/**
 * `calories` is an `integer` column; the other three are `numeric(6,2)`, so
 * they top out at 9999.99 and carry two decimals. Both limits are stated here
 * for the reason `MAX_MONEY_CAD` is: without them a weight of 100000 is a
 * Postgres `22003` and a 500, and `proteinG: 7.129` is silently stored as 7.13.
 */
const nutritionGrams = z
  .number()
  .min(0)
  .max(9999.99, 'Valeur trop élevée')
  .refine(hasAtMostTwoDecimals, 'Deux décimales maximum');

export const nutritionSchema = z.object({
  calories: z.number().int('Nombre entier').min(0).max(100_000, 'Valeur trop élevée'),
  proteinG: nutritionGrams,
  fatG: nutritionGrams,
  weightG: nutritionGrams,
});

/** `['Bio', ' frais', '']` → `['bio', 'frais']` — port of `parseTags`, minus the CSV splitting a JSON array makes unnecessary. */
const tagsSchema = z
  .array(z.string())
  .max(20, 'Vingt étiquettes au maximum')
  .transform((tags) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]);

/**
 * The fields themselves, carrying **no defaults**.
 *
 * Defaults belong to creation only, and applying them to a patch is silent data
 * loss rather than a convenience: `.partial()` wraps a defaulted field in
 * `optional`, but the default still fires when the key is absent, so a
 * `PATCH { name }` would arrive at the service with `tags: []` and
 * `imageUrl: ''` — indistinguishable from a merchant deliberately clearing
 * both, and the update would wipe them. So the defaults are added on the way
 * into `createProductSchema` and nowhere else.
 */
const productFields = z.object({
  name: z.string().trim().min(2, 'Nom du produit requis'),
  description: z.string().trim().min(10, 'Décrivez le produit en quelques mots'),
  categoryId: z.uuid('Choisissez une catégorie'),
  sectionId: z.uuid('Choisissez un rayon'),
  priceCad: money('Prix requis'),
  compareAtPriceCad: money('Doit être supérieur à 0').optional(),
  // Capped at the `integer` column's own limit, so an absurd quantity is a 400
  // rather than a Postgres overflow surfacing as a 500.
  stockQty: z.number().int('Quantité en stock requise').min(0, 'Quantité en stock requise').max(2_147_483_647),
  isAvailable: z.boolean(),
  tags: tagsSchema,
  /** A Storage path under this product's own vendor prefix — see `media-paths.ts`. */
  imageUrl: z.string().trim(),
  nutrition: nutritionSchema.optional(),
});

/**
 * A "was" price at or below the selling price would render as a negative
 * discount. `null` (an explicit "take it off sale") and `undefined` (absent
 * from a patch) both mean there is no pair to compare.
 */
const comparePriceRule = (data: { priceCad?: number; compareAtPriceCad?: number | null }, ctx: z.RefinementCtx) => {
  if (data.compareAtPriceCad == null || data.priceCad === undefined) return;
  if (data.compareAtPriceCad > data.priceCad) return;
  ctx.addIssue({
    code: 'custom',
    path: ['compareAtPriceCad'],
    message: 'Le prix barré doit être supérieur au prix de vente',
  });
};

/** The three fields the mobile form always sends, defaulted here so a leaner client need not. */
export const createProductSchema = productFields
  .extend({
    isAvailable: z.boolean().default(true),
    imageUrl: z.string().trim().default(''),
    tags: tagsSchema.default([]),
  })
  .superRefine(comparePriceRule);

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * A patch. `compareAtPriceCad: null` clears a struck-through price — `undefined`
 * (absent) means "leave it alone", and without a way to say the difference a
 * merchant could put a product on sale but never take it off.
 */
export const updateProductSchema = productFields
  .partial()
  .extend({
    compareAtPriceCad: money('Doit être supérieur à 0').nullable().optional(),
    // Nullable for the same reason: a merchant who filled the nutrition block
    // by mistake had no way to empty it again, and the product page kept
    // drawing the four-column strip forever.
    nutrition: nutritionSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucun champ à modifier')
  .superRefine(comparePriceRule);

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
