import { describe, expect, it } from 'vitest';

import { createAddressSchema } from '../addresses/dto/address.dto.js';

/**
 * Direct port of the address-validation cases from the mobile app's
 * `scripts/verify-logic.ts` — same inputs, same expected outcomes, since
 * this is a byte-for-byte port of `lib/validation/address.ts`.
 */
describe('createAddressSchema (ported from the mobile app)', () => {
  const base = { label: 'Domicile' };

  it('rejects an unserved city', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '1420 Rue Sainte-Catherine Ouest',
      city: 'Trois-Rivières',
      postalCode: 'G8T 1A1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a postal code outside the chosen city', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '1420 Rue Sainte-Catherine Ouest',
      city: 'Montréal',
      postalCode: 'H7S 1Y7', // a real Laval code
    });
    expect(result.success).toBe(false);
  });

  it('rejects a Laval code filed under Montréal', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '100 Boulevard Cartier',
      city: 'Montréal',
      postalCode: 'H7S 1Y7',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a Laval code filed under Laval', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '100 Boulevard Cartier',
      city: 'Laval',
      postalCode: 'H7S 1Y7',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a Montréal-Nord code filed under Montréal — the borough is Montréal', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '4000 Rue de Charleroi',
      city: 'Montréal',
      postalCode: 'H1G 2S4',
    });
    expect(result.success).toBe(true);
  });

  it('accepts the same code filed under Montréal-Nord', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '4000 Rue de Charleroi',
      city: 'Montréal-Nord',
      postalCode: 'H1G 2S4',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed postal code', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '1420 Rue Sainte-Catherine Ouest',
      city: 'Montréal',
      postalCode: 'H3G1',
    });
    expect(result.success).toBe(false);
  });

  it('normalizes a lowercase, unspaced postal code on the way out', () => {
    const result = createAddressSchema.safeParse({
      ...base,
      street: '3450 Rue Jean-Talon Est',
      city: 'Montréal',
      postalCode: 'h1x1g8',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.postalCode).toBe('H1X 1G8');
  });
});
