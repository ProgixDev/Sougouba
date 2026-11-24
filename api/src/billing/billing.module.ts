import { Module } from '@nestjs/common';

import { CourierModule } from '../courier/courier.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AnalyticsService } from './analytics.service.js';
import {
  AdminPayoutsController,
  BillingReturnController,
  ConnectReturnController,
  CourierBillingController,
  MerchantBillingController,
} from './billing.controller.js';
import { ConnectService } from './connect.service.js';
import { PayoutsScheduler } from './payouts.scheduler.js';
import { PayoutsService } from './payouts.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Phase 7 — the money that moves *after* an order: the platform's 12 % cut, the
 * merchant's 70 $/month, and the courier's weekly payout.
 *
 * Separate from `OrdersModule`, which owns the money moving *during* checkout.
 * They share `PaymentsService` (one Stripe client, one place the key is read)
 * but almost nothing else: taking a payment and settling a week of them are
 * different concerns with different failure modes.
 */
@Module({
  imports: [OrdersModule, LoyaltyModule, CourierModule],
  controllers: [
    MerchantBillingController,
    CourierBillingController,
    AdminPayoutsController,
    ConnectReturnController,
    BillingReturnController,
    // Stripe's one callback. Here rather than in `OrdersModule` because it
    // records subscriptions as well as reconciling order payments.
    StripeWebhookController,
  ],
  providers: [AnalyticsService, ConnectService, PayoutsService, PayoutsScheduler, SubscriptionsService],
  exports: [AnalyticsService, PayoutsService, PayoutsScheduler, SubscriptionsService],
})
export class BillingModule {}
