import { Controller, Headers, HttpCode, Inject, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import { PaymentsService } from '../orders/payments.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Stripe's callback. **Unauthenticated by design** — Stripe has no bearer token
 * to present — so the signature check in `constructEvent` is the whole gate. It
 * is not decoration: without it this is an internet-facing endpoint that
 * anyone could POST "this order was paid" to.
 *
 * What this endpoint is *for* is worth stating, because the order is already
 * created elsewhere. `POST /orders` verifies the intent directly with Stripe
 * before writing, so the happy path never needs this. The webhook exists for
 * the unhappy one: the shopper's payment succeeds and the app then dies, loses
 * the network, or is force-quit before it can call `POST /orders`. The money
 * moved, no order exists, and nothing on the device will ever try again. That
 * is money taken for nothing, and this is the only place it is detectable.
 *
 * It is also the only way this API learns what happens to a merchant's
 * **subscription** while nobody is looking: a renewal that went through, a card
 * that was declined on the 1st, a cancellation made in Stripe's portal. Those
 * are not optional to hear about — without them the recorded standing is right
 * on the day of checkout and wrong from the first renewal on.
 *
 * Declared in `BillingModule` rather than `OrdersModule`, where it started:
 * it needs `SubscriptionsService`, and billing already depends on orders.
 *
 * Hidden from Swagger: it is not part of the app's API surface, and publishing
 * its shape only helps someone probing it.
 */
@ApiExcludeController()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(DB) private readonly db: Db
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string | undefined
  ): Promise<{ received: true }> {
    // The raw, unparsed bytes: the signature is computed over exactly what
    // Stripe sent, so anything that re-serialises the JSON first — key order,
    // whitespace, unicode escaping — invalidates it. `rawBody: true` in
    // `main.ts` is what makes this available.
    const event = this.payments.constructEvent(request.rawBody ?? '', signature);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        // Nothing to undo — no order is written until a payment has succeeded,
        // so a failure leaves no trace to clean up. Logged because a rising
        // failure rate is a real signal about the payment configuration.
        this.logger.warn(`PaymentIntent ${event.data.object.id} failed: ${event.data.object.last_payment_error?.message}`);
        break;
      // ── the merchant's subscription ───────────────────────────────────────
      //
      // Every one of these ends the same way: re-read that customer's
      // subscription from Stripe and record it. None trusts its own payload for
      // the standing, so a late, repeated or out-of-order event is harmless.
      case 'checkout.session.completed':
        // The shopper's checkout is a PaymentIntent, not a Checkout Session;
        // the only sessions this account opens are subscriptions.
        if (event.data.object.mode === 'subscription') await this.onCustomer(event.data.object.customer);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.onCustomer(event.data.object.customer);
        break;
      case 'charge.refunded':
        // A subscription payment given back from the dashboard: Stripe may have
        // changed the subscription with it.
        await this.onCustomer(event.data.object.customer);
        break;
      case 'charge.dispute.created':
        // A merchant's bank is reversing a subscription payment (or a shopper's
        // an order). Nothing here can answer a dispute; a person has to, in the
        // Stripe dashboard, before its deadline.
        this.logger.error(
          `DISPUTE ${event.data.object.id} opened on charge ${String(event.data.object.charge)} (${event.data.object.amount} ${event.data.object.currency}, reason ${event.data.object.reason}) — answer it in the Stripe dashboard.`
        );
        break;
      case 'radar.early_fraud_warning.created':
        this.logger.error(
          `FRAUD WARNING ${event.data.object.id} on charge ${String(event.data.object.charge)} (${event.data.object.fraud_type}) — review it in the Stripe dashboard before it becomes a dispute.`
        );
        break;
      default:
        // Stripe sends far more event types than any integration subscribes to,
        // and an unrecognised one is not an error.
        break;
    }

    // 200 once the event is handled. A handler that throws — the database or
    // Stripe unreachable while recording a subscription — answers 500 instead,
    // and that is deliberate: Stripe retries with backoff, which is exactly
    // what a transient failure needs.
    return { received: true };
  }

  /** `customer` arrives as an id, an expanded object, or nothing at all on an event with no customer. */
  private async onCustomer(customer: string | { id: string } | null | undefined): Promise<void> {
    const id = typeof customer === 'string' ? customer : customer?.id;
    if (id) await this.subscriptions.onCustomerEvent(id);
  }

  /**
   * The reconciliation check: money arrived, so there had better be an order.
   *
   * A miss here is not necessarily a bug — this webhook routinely arrives
   * *before* the app's own `POST /orders` — so it is logged, not acted on. What
   * makes it actionable is the same intent still having no order minutes later,
   * which a Phase 10 alert on this log line is the right way to catch. Refunding
   * automatically from here would race the legitimate call and cancel real
   * orders.
   */
  private async onPaymentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    const order = await unwrap<{ id: string } | null>(
      this.db.from('orders').select('id').eq('stripe_payment_intent_id', intent.id).maybeSingle()
    );

    if (order) return;

    this.logger.warn(
      `PaymentIntent ${intent.id} succeeded (${intent.amount_received} ${intent.currency}, customer ${intent.metadata?.customerId}) with no order yet — expected if the app has not finished checkout, needs a refund if it never does.`
    );
  }
}
