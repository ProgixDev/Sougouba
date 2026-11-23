import { Module } from '@nestjs/common';

import { CourierModule } from '../courier/courier.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { CourierChatController, CustomerChatController } from './order-chat.controller.js';
import { OrderChatService } from './order-chat.service.js';
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
  // `CourierModule` only for `DispatchScheduler.nudge`: a placed order should
  // reach a courier immediately on a host where no dispatch timer runs. Safe
  // to import — `CourierModule` reaches into this module's files directly
  // (`order-view`, `order-status`) but does not import the module, so there is
  // no cycle.
  // Checkout needs all three of what `LoyaltyModule` exports: the balance to
  // clamp a redemption against, the debit to write once the order exists, and
  // the coupon to price and then mark used.
  imports: [LoyaltyModule, CourierModule],
  controllers: [OrdersController, VendorOrdersController, StripeWebhookController, CustomerChatController, CourierChatController],
  providers: [OrdersService, PaymentsService, OrderChatService],
  // `PaymentsService` is exported so Phase 6's refunds go back through the same
  // Stripe client that took the money, rather than a second one configured
  // separately.
  exports: [OrdersService, PaymentsService],
})
export class OrdersModule {}
