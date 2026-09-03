import { Controller, Headers, HttpCode, Inject, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { orders } from '../db/schema/index.js';
import { PaymentsService } from './payments.service.js';

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
 * Hidden from Swagger: it is not part of the app's API surface, and publishing
 * its shape only helps someone probing it.
 */
@ApiExcludeController()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly payments: PaymentsService,
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
      default:
        // Stripe sends far more event types than any integration subscribes to,
        // and an unrecognised one is not an error. Phase 7 adds the `invoice.*`
        // cases for merchant subscriptions here.
        break;
    }

    // Always 200, as long as the signature was good. A non-2xx makes Stripe
    // retry with backoff for days, which is right for a transient failure and
    // wrong for an event this integration simply has no case for.
    return { received: true };
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
    const [order] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, intent.id))
      .limit(1);

    if (order) return;

    this.logger.warn(
      `PaymentIntent ${intent.id} succeeded (${intent.amount_received} ${intent.currency}, customer ${intent.metadata?.customerId}) with no order yet — expected if the app has not finished checkout, needs a refund if it never does.`
    );
  }
}
