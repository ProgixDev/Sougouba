import { z } from 'zod';

import { paginationSchema } from '../../catalog/dto/query.dto.js';
import { ORDER_STATUSES } from '../order-status.js';

/**
 * A cart, as the client describes it — **product ids and quantities only**.
 *
 * There is deliberately no price field anywhere in this schema. The mock's own
 * `createOrder` already recomputed the subtotal rather than accepting one, and
 * the plan generalises it: "price, discount, commission and PIN all come from
 * the server's own state, never an argument the client supplied as fact". A
 * `unitPriceCad` on the wire would be a number worth attacking; one that does
 * not exist is not.
 */
export const cartSchema = z.object({
  vendorId: z.uuid(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        qty: z.number().int().min(1, 'Quantité minimale 1').max(99, 'Quantité maximale 99'),
      })
    )
    .min(1, 'Le panier est vide')
    .max(100, 'Trop de lignes dans le panier'),
  /** One of the shopper's own saved addresses — never a free-text address, which would skip validation and geocoding. */
  addressId: z.uuid(),
  /**
   * What the shopper *asked* to redeem. Clamped server-side against the 20 %
   * cap and their real balance (`priceOrder`), so a large number here is
   * harmless rather than free money.
   */
  redeemPoints: z.number().int().min(0).default(0),
  /**
   * "Appliquer un code promo" at checkout. Validated, priced and marked used
   * server-side — the client never says what a coupon is worth, only which one
   * it typed. Optional; an unknown or expired code is refused with a reason
   * rather than silently ignored, so the shopper knows the discount they were
   * expecting is not coming.
   */
  couponCode: z.string().trim().min(1).max(64).optional(),
});

export type CartInput = z.infer<typeof cartSchema>;

/**
 * Placing the order. Same cart, plus the intent that paid for it — re-priced
 * from scratch and re-verified against Stripe before anything is written.
 */
export const placeOrderSchema = cartSchema.extend({
  paymentIntentId: z.string().trim().min(1, 'Paiement requis'),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  /** Merchant queue view: everything not yet delivered or cancelled. */
  activeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  /**
   * Customer name, or a whole order id pasted in. A uuid column cannot be
   * prefix-matched through PostgREST, so a truncated id only matches by name.
   */
  search: z.string().trim().min(1).max(100).optional(),
  /**
   * The merchant tab's chips. `active` lists oldest first (the queue is worked
   * from the front); every other view is newest first. `disputes` is every
   * order that has one, answered or not.
   */
  view: z.enum(['active', 'disputes', 'delivered', 'cancelled', 'all']).optional(),
});

export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const advanceStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export type AdvanceStatusInput = z.infer<typeof advanceStatusSchema>;

// ── disputes ────────────────────────────────────────────────────────────────

export const openDisputeSchema = z.object({
  reason: z.enum(['missing_items', 'wrong_order', 'quality', 'late', 'other'], {
    message: 'Choisissez un motif',
  }),
  message: z.string().trim().min(10, 'Décrivez le problème en quelques mots').max(2000, 'Trop long'),
});

export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;

export const replyDisputeSchema = z.object({
  message: z.string().trim().min(1, 'Réponse requise').max(2000, 'Trop long'),
});

export type ReplyDisputeInput = z.infer<typeof replyDisputeSchema>;

// ── reviews ─────────────────────────────────────────────────────────────────

const stars = (message: string) => z.number({ message }).int(message).min(1, message).max(5, message);

/**
 * The shop is always rated; the courier only if the shopper has something to
 * say about them. Same bounds as the table's check constraints
 * (`drizzle/0036_order_reviews.sql`), stated here so a bad value is a 400 with
 * a sentence rather than a constraint violation and a 500.
 */
export const submitReviewSchema = z.object({
  vendorRating: stars('Donnez une note de 1 à 5 au commerce'),
  courierRating: stars('La note du livreur doit être de 1 à 5').optional(),
  comment: z.string().trim().max(1000, 'Trop long').optional(),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

/** One chat message. Same bounds as `order_messages.body` (`drizzle/0049_order_messages.sql`). */
export const sendOrderMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message vide').max(1000, 'Message trop long (1000 caractères au plus)'),
});

export type SendOrderMessageInput = z.infer<typeof sendOrderMessageSchema>;
