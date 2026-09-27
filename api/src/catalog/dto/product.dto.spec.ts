import { describe, expect, it } from 'vitest';

import { createProductSchema, PRICE_BANDS, productQuerySchema, updateProductSchema } from './product.dto.js';

const CATEGORY = '7f3a1c00-0000-4000-8000-000000000001';
const SECTION = '33333333-3333-4333-8333-333333333333';

const valid = {
  name: 'Riz basmati',
  description: 'Sac de 5 kg, grain long, récolte 2026.',
  categoryId: CATEGORY,
  sectionId: SECTION,
  priceCad: 18.5,
  stockQty: 40,
  isAvailable: true,
  tags: ['Bio', ' frais ', '', 'bio'],
};

describe('createProductSchema', () => {
  it('normalises tags the way `parseTags` does — trimmed, lowercased, deduped, blanks dropped', () => {
    const parsed = createProductSchema.parse(valid);
    expect(parsed.tags).toEqual(['bio', 'frais']);
  });

  it('defaults the fields the mobile form always sends', () => {
    const { tags: _tags, isAvailable: _isAvailable, ...withoutDefaults } = valid;
    const parsed = createProductSchema.parse(withoutDefaults);
    expect(parsed.tags).toEqual([]);
    expect(parsed.isAvailable).toBe(true);
    expect(parsed.imageUrl).toBe('');
  });

  it('refuses a struck-through price at or below the selling price', () => {
    // Would render as a negative (or zero) discount on the product card.
    expect(createProductSchema.safeParse({ ...valid, compareAtPriceCad: 12 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, compareAtPriceCad: 18.5 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, compareAtPriceCad: 22 }).success).toBe(true);
  });

  it('refuses a free product but allows a zero-stock one', () => {
    // A price of 0 is almost always a blank field that slipped through; a
    // stock of 0 is an ordinary sold-out shelf.
    expect(createProductSchema.safeParse({ ...valid, priceCad: 0 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, stockQty: 0 }).success).toBe(true);
  });

  it('refuses more than two decimal places', () => {
    // `price_cad` is numeric(10,2): 4.999 would round in the column and the
    // merchant would be told they saved something they did not.
    expect(createProductSchema.safeParse({ ...valid, priceCad: 4.999 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, priceCad: 4.99 }).success).toBe(true);
  });

  it('refuses figures the columns could not hold', () => {
    // Each of these was a Postgres 22003 surfacing as a 500 before the bounds
    // existed. `price_cad` is numeric(10,2), `stock_qty` is an integer, and the
    // nutrition grams are numeric(6,2).
    expect(createProductSchema.safeParse({ ...valid, priceCad: 100_000_000 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, stockQty: 2_147_483_648 }).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...valid, nutrition: { calories: 0, proteinG: 0, fatG: 0, weightG: 100_000 } }).success
    ).toBe(false);
  });

  it('holds nutrition grams to two decimals, like the price', () => {
    // 7.129 was silently stored as 7.13 — the exact "told they saved something
    // they didn't" failure the price rule exists to prevent, just unapplied here.
    expect(
      createProductSchema.safeParse({ ...valid, nutrition: { calories: 350, proteinG: 7.129, fatG: 1, weightG: 100 } }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...valid, nutrition: { calories: 350, proteinG: 7.12, fatG: 1, weightG: 100 } }).success
    ).toBe(true);
  });

  it('takes nutrition as all four values or none', () => {
    expect(createProductSchema.safeParse({ ...valid, nutrition: { calories: 350, proteinG: 7, fatG: 1, weightG: 100 } }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...valid, nutrition: { calories: 350, proteinG: 7 } }).success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('distinguishes "leave the sale price alone" from "take it off sale"', () => {
    expect(updateProductSchema.parse({ name: 'Riz' })).not.toHaveProperty('compareAtPriceCad');
    expect(updateProductSchema.parse({ compareAtPriceCad: null }).compareAtPriceCad).toBeNull();
  });

  it('refuses an empty patch', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
  });

  it('lets a merchant clear the nutrition block they filled by mistake', () => {
    // Without `.nullable()` there was no request that could set the four
    // columns back to NULL, so the product page drew the strip forever.
    expect(updateProductSchema.parse({ nutrition: null }).nutrition).toBeNull();
    expect(updateProductSchema.safeParse({ nutrition: { calories: 1, proteinG: 1, fatG: 1, weightG: 1 } }).success).toBe(true);
  });

  it('does not invent values the caller did not send', () => {
    // Regression. `updateProductSchema` was first derived from the same object
    // as `createProductSchema`, defaults included: `.partial()` makes a
    // defaulted field optional but the default still fires when the key is
    // absent, so `PATCH { name }` arrived carrying `tags: []` and
    // `imageUrl: ''`. The service can't tell that from a merchant deliberately
    // clearing both — so renaming a product silently deleted its tags and its
    // photo. Every key absent from the request must stay absent.
    const parsed = updateProductSchema.parse({ name: 'Riz basmati' });
    expect(Object.keys(parsed)).toEqual(['name']);
  });

  it('still checks the price pair when both are sent together', () => {
    expect(updateProductSchema.safeParse({ priceCad: 20, compareAtPriceCad: 15 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ priceCad: 15, compareAtPriceCad: 20 }).success).toBe(true);
  });
});

describe('productQuerySchema', () => {
  it('reads "false" as false, not as a truthy string', () => {
    // The bug this pins: `?onSale=false` is the *string* "false", which is
    // truthy — a plain boolean coercion turns every "don't filter" into "do".
    expect(productQuerySchema.parse({ onSale: 'false' }).onSale).toBe(false);
    expect(productQuerySchema.parse({ onSale: 'true' }).onSale).toBe(true);
    expect(productQuerySchema.parse({}).onSale).toBeUndefined();
  });

  it('coerces pagination and caps the page size', () => {
    expect(productQuerySchema.parse({ limit: '5', offset: '10' })).toMatchObject({ limit: 5, offset: 10 });
    expect(productQuerySchema.safeParse({ limit: '100000' }).success).toBe(false);
  });

  it('defaults to relevance and no price band', () => {
    expect(productQuerySchema.parse({})).toMatchObject({ sort: 'relevance', priceBand: 'all', limit: 20, offset: 0 });
  });
});

describe('PRICE_BANDS', () => {
  it('keeps the mobile app’s inclusive-lower/exclusive-upper bounds', () => {
    // A product at exactly $10.00 belongs in "10 $ à 20 $" and nowhere else.
    // Flipping either comparison puts it in two bands or in none.
    expect(PRICE_BANDS.under_10).toEqual([null, 10]);
    expect(PRICE_BANDS['10_to_20']).toEqual([10, 20]);
    expect(PRICE_BANDS.over_20).toEqual([20, null]);
    expect(PRICE_BANDS.all).toEqual([null, null]);
  });
});
