import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

import type { DeliveryOffer } from '../../lib/dispatch';
import { useSessionStore } from '../../store/useSessionStore';
import { api, ApiError, apiUrl, type Page } from '../http';
import type { DeliveryDetails } from './addresses';
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

/**
 * A link to the order's receipt, as a PDF drawn in `locale`.
 *
 * A link and not the file: the receipt opens in the system browser, which
 * cannot send this app's token, so the API signs a URL that is itself the
 * credential. It names this one order and stops working after a few minutes —
 * ask for a fresh one each time rather than keeping it.
 */
export async function getReceiptUrl(orderId: ID, locale: 'fr' | 'en'): Promise<string> {
  const { path } = await api<{ path: string; expiresAt: string }>(`/orders/${orderId}/receipt-link`, {
    query: { locale },
  });
  return apiUrl(path);
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
export async function placeOrder(
  cart: Cart & {
    paymentIntentId: string;
    /** As confirmed at checkout; the API copies it onto the order and remembers it on the address. */
    delivery?: DeliveryDetails;
  }
): Promise<Order> {
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

/**
 * The shopper cancels their own order, with a reason — only while the shop has
 * not accepted it. Refunded in full by the server.
 *
 * Not `tryPost`: every refusal here carries a sentence written for the shopper
 * ("la boutique a déjà accepté…"), so the caller shows the error's message
 * rather than a generic one.
 */
export async function cancelOrder(orderId: ID, input: { reason: string; note?: string }): Promise<Order> {
  return api<Order>(`/orders/${orderId}/cancel`, { method: 'POST', body: input });
}

export async function openDispute(
  orderId: ID,
  input: { reason: string; message: string }
): Promise<Order | undefined> {
  return (await tryPost<Order>(`/orders/${orderId}/dispute`, input)) ?? undefined;
}

/** Rates a delivered order — once. A second call is a 409 with a sentence to show. */
export async function submitReview(
  orderId: ID,
  input: { vendorRating: number; courierRating?: number; comment?: string }
): Promise<Order | undefined> {
  return (await tryPost<Order>(`/orders/${orderId}/review`, input)) ?? undefined;
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

/**
 * Send the photo proof to Storage and return the path `completeDelivery` takes.
 *
 * Two hops, like a merchant's registration documents: the API signs a one-shot
 * upload URL under this run's folder, then the bytes go straight to Storage
 * rather than through the API.
 */
export async function uploadDeliveryPhoto(orderId: ID, uri: string, mimeType: string): Promise<string> {
  const { path, uploadUrl } = await api<{ path: string; uploadUrl: string }>(
    `/couriers/me/runs/${orderId}/proof-upload`,
    { method: 'POST', body: { contentType: mimeType } }
  );
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: new File(uri),
  });
  if (!response.ok) {
    throw new ApiError(response.status, "Envoi de la photo impossible. Veuillez réessayer.");
  }
  return path;
}

export interface SignatureStrokes {
  width: number;
  height: number;
  /** `M x y L x y…`, one entry per stroke, as the pad recorded them. */
  paths: string[];
}

/**
 * Store the drawn signature and return its path for `completeDelivery`.
 *
 * Strokes, not a file: the API writes the SVG itself, so nothing the phone sends
 * ends up as markup someone else opens.
 */
export async function saveDeliverySignature(orderId: ID, strokes: SignatureStrokes): Promise<string> {
  const { path } = await api<{ path: string }>(`/couriers/me/runs/${orderId}/signature`, {
    method: 'POST',
    body: strokes,
  });
  return path;
}

/**
 * The courier hands the run back before pickup, with a reason. The order goes
 * straight back to dispatch. Throws with the server's sentence when the run can
 * no longer be handed back.
 */
export async function releaseRun(orderId: ID, input: { reason: string; note?: string }): Promise<void> {
  await api<{ released: true }>(`/couriers/me/runs/${orderId}/release`, { method: 'POST', body: input });
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
 * The platform's best sellers over the last 30 days, most units first — ids
 * only, for the home screen's "Articles les + vendus" rail.
 *
 * Only products a shopper can buy right now are ranked (approved shop, on
 * sale, in stock). An empty list — no sales yet, or the API's database
 * function not deployed — makes the home screen fill the rail with deals.
 */
export async function getTopProductIds(limit = 6): Promise<ID[]> {
  const { ids } = await api<{ ids: ID[] }>('/products/best-sellers', { anonymous: true, query: { limit } });
  return ids;
}

// ── pages ───────────────────────────────────────────────────────────────────

/** One page of the signed-in shopper's orders, newest first. Each carries its shop's `vendorName`. */
export async function getMyOrdersPage(offset: number, limit: number): Promise<Page<Order>> {
  return api<Page<Order>>('/orders', { query: { offset, limit } });
}

/** The merchant tab's chips. `active` lists oldest first; the rest newest first. */
export type VendorOrderView = 'active' | 'disputes' | 'delivered' | 'cancelled' | 'all';

export async function getVendorOrdersPage(view: VendorOrderView, offset: number, limit: number): Promise<Page<Order>> {
  return api<Page<Order>>('/vendors/me/orders', { query: { view, offset, limit } });
}

/** Each chip's count and amount, counted by the database over the whole shop. */
export type VendorOrderSummary = Record<VendorOrderView, { count: number; amountCad: number }>;

export async function getVendorOrderSummary(): Promise<VendorOrderSummary> {
  return api<VendorOrderSummary>('/vendors/me/orders/summary');
}

/** One page of the signed-in courier's runs, newest first. */
export async function getCourierRunsPage(
  offset: number,
  limit: number,
  { deliveredOnly = false }: { deliveredOnly?: boolean } = {}
): Promise<Page<Order>> {
  return api<Page<Order>>('/couriers/me/runs', {
    query: { paged: true, deliveredOnly: deliveredOnly || undefined, offset, limit },
  });
}

/** A courier's totals over the last `days` days, summed by the database. */
export interface CourierTotals {
  days: number;
  earningsCad: number;
  tipsCad: number;
  distanceKm: number;
  runCount: number;
  avgPerRunCad: number;
}

export async function getCourierTotals(days: number): Promise<CourierTotals> {
  return api<CourierTotals>('/couriers/me/earnings', { query: { days } });
}

/** The shopper's profile figures, over every order — cancelled ones excluded. */
export async function getMyOrderStats(): Promise<{ orderCount: number; spentCad: number }> {
  return api<{ orderCount: number; spentCad: number }>('/orders/stats');
}
