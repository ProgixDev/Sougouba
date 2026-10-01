import type { DeliveryOffer } from '../../lib/dispatch';
import { useSessionStore } from '../../store/useSessionStore';
import { api, ApiError, type Page } from '../http';
import type {
  Address,
  Courier,
  ID,
  Order,
  OrderItem,
  OrderStatus,
} from '../types';

/**
 * Orders — the domain where the cutover changes the most, because it is the one
 * where the mock was allowed to do things a client must never do.
 *
 * Three rules the server now owns outright, each of which used to run here:
 *
 * 1. **What an order costs.** `createOrder` recomputed the subtotal, taxes and
 *    delivery fee itself, which was already the right instinct. The API does the
 *    same recomputation from its own catalogue and its own distance grid — and
 *    because that happens after the client has been quoted, a price that moved
 *    in between is caught rather than honoured.
 * 2. **Whether it was paid for.** An order is written only after Stripe confirms
 *    the money moved, and `assertPaidBy` re-checks the amount and the payer.
 * 3. **Points and coupons.** Both are claimed inside the order's own
 *    transaction, so a checkout that fails cannot spend either.
 */

/** One customer's order list is tens of rows; the orders tab shows it whole. */
const ALL = 100;

// ── reads ───────────────────────────────────────────────────────────────────

/** ⚠️ `customerId` is ignored — the API answers from the token. Kept so screens need no edit. */
export async function getOrdersByCustomer(_customerId: ID): Promise<Order[]> {
  const page = await api<Page<Order>>('/orders', { query: { limit: ALL } });
  return page.items;
}

/** ⚠️ Likewise `vendorId`: a merchant reads their own shop's queue, resolved from the token. */
export async function getOrdersByVendor(_vendorId: ID): Promise<Order[]> {
  const page = await api<Page<Order>>('/vendors/me/orders', { query: { limit: ALL } });
  return page.items;
}

/**
 * One order.
 *
 * Tries the shopper's view, then the merchant's, then the courier's — they are different
 * endpoints because they are different claims, and the API checks each against
 * the row rather than trusting it. A 404 either way: an order that exists but
 * is not yours must not be distinguishable from one that does not.
 */
export async function getOrderById(id: ID): Promise<Order | undefined> {
  // The signed-in role's own view first — the others are only a fallback, and
  // asking them first cost a courier two 404s on every screen of a run.
  const views: Record<string, string> = {
    customer: `/orders/${id}`,
    business: `/vendors/me/orders/${id}`,
    // A courier reads the runs they carry — without the PIN, which is the shopper's.
    courier: `/couriers/me/runs/${id}`,
  };
  const role = useSessionStore.getState().user?.role;
  const order = [role && views[role], ...Object.values(views).filter((v) => v !== (role && views[role]))];
  for (const path of order) {
    if (!path) continue;
    const found = await tryGet<Order>(path);
    if (found) return found;
  }
  return undefined;
}

async function tryGet<T>(path: string): Promise<T | undefined> {
  try {
    return await api<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403 || error.status === 401)) {
      return undefined;
    }
    throw error;
  }
}

export interface CourierPing {
  lat: number;
  lng: number;
  heading: number | null;
  recordedAt: string;
}

/** The courier's latest GPS ping on one of the shopper's own orders, or null before the first. */
export async function getCourierLocation(orderId: ID): Promise<CourierPing | null> {
  const { location } = await api<{ location: CourierPing | null }>(`/orders/${orderId}/courier-location`);
  return location;
}

// ── checkout ────────────────────────────────────────────────────────────────

export type Cart = {
  vendorId: ID;
  addressId: ID;
  items: { productId: ID; qty: number }[];
  redeemPoints?: number;
  couponCode?: string;
};

/** What the checkout screen shows before the payment sheet opens — priced by the server. */
export async function quoteCart(cart: Cart): Promise<{
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  pointsRedeemed: number;
  pointsDiscountCad: number;
  couponCode: string | null;
  couponDiscountCad: number;
  totalCad: number;
  items: { productId: ID; name: string; qty: number; unitPriceCad: number }[];
}> {
  return api('/orders/quote', { method: 'POST', body: cart });
}

/** Step 2: a PaymentIntent for the same cart, priced again server-side. No order row is written yet. */
export async function createPaymentIntent(cart: Cart): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  quote: Awaited<ReturnType<typeof quoteCart>>;
}> {
  return api('/orders/payment-intent', { method: 'POST', body: cart });
}

/** Step 3, after Stripe confirms: the order is written, or refused if the price moved. */
export async function placeOrder(cart: Cart & { paymentIntentId: string }): Promise<Order> {
  return api<Order>('/orders', { method: 'POST', body: cart });
}

/**
 * ⚠️ **The old one-step checkout is gone, and this throws.**
 *
 * `createOrder` wrote an order directly. It cannot any more, and should not: an
 * order that exists without a payment is an order the merchant will pack and
 * nobody paid for. The replacement is the three steps above, with Stripe's
 * confirmation between the second and the third.
 *
 * **What is missing to finish it:** `@stripe/stripe-react-native` is not
 * installed, so nothing in the app can confirm a PaymentIntent. The publishable
 * key is already in `.env`. Until the payment sheet is wired,
 * `app/(customer)/checkout.tsx` has no way to complete an order — which is why
 * this throws a sentence saying so rather than failing at the API with
 * "assertPaidBy refused".
 */
export async function createOrder(_input: {
  customerId: ID;
  customerName?: string;
  vendorId: ID;
  items: OrderItem[];
  deliveryAddress: Address;
  createdAt: string;
  redeemPoints?: number;
}): Promise<Order> {
  throw new Error(
    'Checkout is now quote → PaymentIntent → confirm → placeOrder. ' +
      'Install @stripe/stripe-react-native and wire the payment sheet; see quoteCart/createPaymentIntent/placeOrder.'
  );
}

// ── the merchant's queue ────────────────────────────────────────────────────

/**
 * Advance or cancel an order, as the merchant.
 *
 * ⚠️ `at` is ignored. The timestamp is the server's — a client-supplied one is
 * how an order gets a history that runs backwards.
 */
export async function updateOrderStatus(id: ID, status: OrderStatus, _at: string): Promise<Order | undefined> {
  return (await tryPost<Order>(`/vendors/me/orders/${id}/status`, { status }, 'PATCH')) ?? undefined;
}

export async function openDispute(
  orderId: ID,
  input: { reason: string; message: string }
): Promise<Order | undefined> {
  return (await tryPost<Order>(`/orders/${orderId}/dispute`, input)) ?? undefined;
}

export async function replyToDispute(orderId: ID, message: string): Promise<Order | undefined> {
  return (await tryPost<Order>(`/vendors/me/orders/${orderId}/dispute/reply`, { message })) ?? undefined;
}

async function tryPost<T>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T | undefined> {
  try {
    return await api<T>(path, { method, body });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

// ── the courier's day ───────────────────────────────────────────────────────

/**
 * ⚠️ `courierId` ignored — `/couriers/me/runs` is resolved from the token.
 *
 * ⚠️ And it returns a **bare array**, not the `Page` envelope every other list
 * on this API uses. So do `/me/loyalty/history` and `/couriers/me/offers`. The
 * inconsistency is the API's; treating them alike is how a caller ends up
 * reading `.items` off an array and getting `undefined` with no error.
 */
export async function getOrdersForCourier(_courierId: ID): Promise<Order[]> {
  return api<Order[]>('/couriers/me/runs', { query: { limit: ALL } });
}

/**
 * Live offers for the signed-in courier.
 *
 * ⚠️ Renamed in spirit: the mock's `getDispatchableOrders` returned every order
 * *anyone* could take, and ranked them on the device. Dispatch is the server's
 * now — it picks the nearest eligible courier and offers the run to them
 * specifically, so this returns only what has been offered to this courier —
 * already priced and timed. Offers, not orders: their `id` is the one
 * `assignCourier` and `declineOffer` take.
 */
export async function getDispatchableOrders(): Promise<DeliveryOffer[]> {
  return api<DeliveryOffer[]>('/couriers/me/offers');
}

export interface AcceptQuote {
  distanceKm: number;
  earningsCad: number;
}

/**
 * Take a run.
 *
 * ⚠️ Takes the **offer** id now, not a courier id and an order id. The claim is
 * the server's insert, so two couriers tapping Accepter in the same second get
 * one winner and one told why — which the mock could only guarantee by being
 * single-threaded.
 */
export async function assignCourier(offerId: ID): Promise<Order | undefined> {
  const result = await tryPost<{ orderId: ID }>(`/couriers/me/offers/${offerId}/accept`, {});
  return result ? getOrderById(result.orderId) : undefined;
}

export async function markPickedUp(orderId: ID, _at: string): Promise<Order | undefined> {
  return (await tryPost<Order>(`/couriers/me/runs/${orderId}/pickup`, {})) ?? undefined;
}

export async function completeDelivery(
  orderId: ID,
  input: { method: 'pin' | 'photo' | 'signature'; pin?: string; imagePath?: string; note?: string; tipCad?: number }
): Promise<Order | undefined> {
  return (await tryPost<Order>(`/couriers/me/runs/${orderId}/complete`, input)) ?? undefined;
}

export async function reportCourierIssue(
  orderId: ID,
  input: { reason: string; message: string }
): Promise<Order | undefined> {
  return (await tryPost<Order>(`/couriers/me/runs/${orderId}/issue`, input)) ?? undefined;
}

// ── merchant analytics ──────────────────────────────────────────────────────

export interface VendorStats {
  revenueCad: number;
  orderCount: number;
  avgBasketCad: number;
  activeProductCount?: number;
}

/**
 * ⚠️ `revenueCad` is the product **subtotal**, not the order total — delivery
 * pays the courier and TPS/TVQ is collected for the government. Reading the
 * total instead overstates a merchant's revenue by around 20 %, which is why
 * the API computes it and this does not.
 */
export async function getVendorStats(_vendorId: ID): Promise<VendorStats> {
  const a = await api<{ revenueCad: number; orderCount: number; avgBasketCad: number }>(
    '/vendors/me/analytics',
    { query: { days: 30 } }
  );
  return { revenueCad: a.revenueCad, orderCount: a.orderCount, avgBasketCad: a.avgBasketCad };
}

/**
 * ⚠️ **No endpoint yet.** The home screen's "Articles les + vendus" ranked
 * products by units sold across every shop; the API has that aggregate only
 * per-merchant (`/vendors/me/analytics`), behind the merchant's own token.
 *
 * A platform-wide version is a small addition — `admin_overview` already does
 * the same shape — but it does not exist, so this returns an empty list and the
 * home screen falls back to its deals ordering, exactly as it does when the
 * catalogue has no sales to rank.
 */
export async function getTopProductIds(_limit = 6): Promise<ID[]> {
  return [];
}
