import { describe, expect, it } from 'vitest';

import { placeOrderSchema } from '../orders/dto/order.dto.js';
import { deliveryDetailsSchema, updateAddressSchema } from './dto/address.dto.js';

/** Same bounds as the columns in `drizzle/0050_delivery_instructions.sql`. */
describe('delivery details', () => {
  it('trims, and reads an empty field as "clear it"', () => {
    const parsed = deliveryDetailsSchema.parse({ unit: '  App. 4, 2e étage ', doorCode: '', deliveryNotes: '   ' });
    expect(parsed).toEqual({ unit: 'App. 4, 2e étage', doorCode: null, deliveryNotes: null });
  });

  it('leaves out what was not sent, so a patch does not erase it', () => {
    expect(deliveryDetailsSchema.parse({ dropoff: 'door' })).toEqual({ dropoff: 'door' });
  });

  it('holds each field to its column limit', () => {
    expect(deliveryDetailsSchema.safeParse({ unit: 'a'.repeat(60) }).success).toBe(true);
    expect(deliveryDetailsSchema.safeParse({ unit: 'a'.repeat(61) }).success).toBe(false);
    expect(deliveryDetailsSchema.safeParse({ doorCode: '1'.repeat(31) }).success).toBe(false);
    expect(deliveryDetailsSchema.safeParse({ deliveryNotes: 'a'.repeat(301) }).success).toBe(false);
  });

  it('knows two ways to hand an order over', () => {
    expect(deliveryDetailsSchema.safeParse({ dropoff: 'hand' }).success).toBe(true);
    expect(deliveryDetailsSchema.safeParse({ dropoff: 'door' }).success).toBe(true);
    expect(deliveryDetailsSchema.safeParse({ dropoff: 'mailbox' }).success).toBe(false);
  });

  it('can change an address without touching where it is', () => {
    expect(updateAddressSchema.safeParse({ doorCode: '4821#' }).success).toBe(true);
  });

  it('is optional when placing an order', () => {
    const base = {
      vendorId: '00000000-0000-4000-8000-000000000001',
      addressId: '00000000-0000-4000-8000-000000000002',
      items: [{ productId: '00000000-0000-4000-8000-000000000003', qty: 1 }],
      paymentIntentId: 'pi_123',
    };
    expect(placeOrderSchema.safeParse(base).success).toBe(true);
    expect(placeOrderSchema.parse({ ...base, delivery: { dropoff: 'door', doorCode: '12' } }).delivery).toEqual({
      dropoff: 'door',
      doorCode: '12',
    });
  });
});
