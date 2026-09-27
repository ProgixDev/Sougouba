import { describe, expect, it } from 'vitest';

import { updateSettingsSchema } from './dto/admin.dto.js';

/**
 * The purge itself is SQL, and SQL is verified against the database rather than
 * mocked — see `0029`'s commit for the seven-case run that proved each branch
 * (old ping deleted, recent kept; old proof with no dispute deleted; open
 * dispute held; resolved dispute released; imaged proof held back).
 *
 * What is worth pinning here is the input that decides how much gets destroyed,
 * because it is the one part a human types.
 */
describe('retention periods', () => {
  it('refuses zero days', () => {
    // Zero reads as "delete on sight": the GPS trail would vanish under the
    // live map, and a delivery proof would be destroyed the moment it was
    // created. Neither is a retention period, and both are one keystroke away
    // from a plausible-looking number.
    expect(updateSettingsSchema.safeParse({ courierLocationRetentionDays: 0 }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ deliveryProofRetentionDays: 0 }).success).toBe(false);
  });

  it('refuses a negative period', () => {
    // A negative cutoff is in the future, so the purge would delete everything.
    expect(updateSettingsSchema.safeParse({ courierLocationRetentionDays: -1 }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ deliveryProofRetentionDays: -30 }).success).toBe(false);
  });

  it('refuses a fractional period', () => {
    expect(updateSettingsSchema.safeParse({ courierLocationRetentionDays: 1.5 }).success).toBe(false);
  });

  it('caps at ten years', () => {
    // "Keep forever" is not a retention policy either, and a policy that
    // publishes a number has to publish a finite one.
    expect(updateSettingsSchema.safeParse({ deliveryProofRetentionDays: 3650 }).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ deliveryProofRetentionDays: 3651 }).success).toBe(false);
  });

  it('accepts the published defaults', () => {
    // The numbers the privacy policy states. If either is ever rejected here,
    // the policy and the code have come apart.
    const parsed = updateSettingsSchema.safeParse({
      courierLocationRetentionDays: 30,
      deliveryProofRetentionDays: 365,
    });

    expect(parsed.success).toBe(true);
  });

  it('lets either period be changed on its own', () => {
    // It is a PATCH: shortening the GPS trail must not require restating the
    // proof period, which is how one of them silently gets reset.
    expect(updateSettingsSchema.safeParse({ courierLocationRetentionDays: 7 }).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ deliveryProofRetentionDays: 90 }).success).toBe(true);
  });
});
