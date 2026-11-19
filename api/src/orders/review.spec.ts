import { describe, expect, it } from 'vitest';

import { submitReviewSchema } from './dto/order.dto.js';

/**
 * The bounds the database enforces again in `drizzle/0036_order_reviews.sql`.
 * Checked here so a bad mark is a 400 with a sentence, not a constraint
 * violation surfacing as a 500.
 */
describe('submitting a review', () => {
  it('needs only the shop rating', () => {
    expect(submitReviewSchema.safeParse({ vendorRating: 4 }).success).toBe(true);
    expect(submitReviewSchema.safeParse({}).success).toBe(false);
    expect(submitReviewSchema.safeParse({ courierRating: 5 }).success).toBe(false);
  });

  it('accepts whole stars from 1 to 5 and nothing else', () => {
    for (const vendorRating of [1, 2, 3, 4, 5]) {
      expect(submitReviewSchema.safeParse({ vendorRating }).success).toBe(true);
    }
    for (const vendorRating of [0, 6, -1, 4.5, '5', null]) {
      expect(submitReviewSchema.safeParse({ vendorRating }).success).toBe(false);
    }
  });

  it('holds the courier rating to the same bounds when it is given', () => {
    expect(submitReviewSchema.safeParse({ vendorRating: 5, courierRating: 3 }).success).toBe(true);
    expect(submitReviewSchema.safeParse({ vendorRating: 5, courierRating: 0 }).success).toBe(false);
    expect(submitReviewSchema.safeParse({ vendorRating: 5, courierRating: 6 }).success).toBe(false);
  });

  it('trims the comment and caps it at the column limit', () => {
    const parsed = submitReviewSchema.parse({ vendorRating: 5, comment: '  Très frais.  ' });
    expect(parsed.comment).toBe('Très frais.');
    expect(submitReviewSchema.safeParse({ vendorRating: 5, comment: 'a'.repeat(1000) }).success).toBe(true);
    expect(submitReviewSchema.safeParse({ vendorRating: 5, comment: 'a'.repeat(1001) }).success).toBe(false);
  });
});
