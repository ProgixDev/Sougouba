import { Module } from '@nestjs/common';

import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PaymentsService } from './payments.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { VendorOrdersController } from './vendor-orders.controller.js';

/**
 * Checkout, orders, order status and disputes.
 *
 * Disputes live here rather than in a module of their own: a dispute has no
 * life independent of the order it is about, and every read of one already
 * holds the order. Phase 6 adds the admin resolution endpoints, which is where
 * a dispute first gets a life beyond the two parties.
 */
@Module({
  // Checkout needs all three of what `LoyaltyModule` exports: the balance to
  // clamp a redemption against, the debit to write once the order exists, and
  // the coupon to price and then mark used.
  imports: [LoyaltyModule],
  controllers: [OrdersController, VendorOrdersController, StripeWebhookController],
  providers: [OrdersService, PaymentsService],
  // `PaymentsService` is exported so Phase 6's refunds go back through the same
  // Stripe client that took the money, rather than a second one configured
  // separately.
  exports: [OrdersService, PaymentsService],
})
export class OrdersModule {}
