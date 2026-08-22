import { defaultDeliveryAddress } from '@/data/seed/addresses';
import type { Address, User } from '@/data/types';

/**
 * Where an order is going, for the shopper we have.
 *
 * The rule — the address marked default, else the first one, else the seeded
 * fallback for an account created in-app with none — was written out at the
 * checkout and needed again the moment the delivery fee became distance-based:
 * the cart, the shop cards and the checkout all have to measure from the same
 * point, or the price quoted on the shop card is not the price charged at the
 * till.
 */
export function deliveryAddressFor(user: User | null | undefined): Address {
  return (
    user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0] ?? defaultDeliveryAddress
  );
}
