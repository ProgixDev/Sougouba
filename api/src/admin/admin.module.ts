import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ApprovalsService } from './approvals.service.js';
import { AuditModule } from './audit.module.js';
import { RefundsService } from './refunds.service.js';
import { RetentionScheduler } from './retention.scheduler.js';
import { RetentionService } from './retention.service.js';
import { SpecialtiesAdminService } from './specialties-admin.service.js';
import { SupportAdminService } from './support-admin.service.js';
import { ModerationService } from './moderation.service.js';
import { AdminAccountsService } from './admin-accounts.service.js';

/**
 * The back office (CDC: "WEB SÉCURISÉ"). An **API only** — the admin web
 * frontend is a separate project, and one already exists in the mobile repo's
 * `admin/` directory running against a localStorage mock shaped like these
 * endpoints.
 *
 * `OrdersModule` is imported for `PaymentsService` (refunds go back through the
 * same Stripe client that took the money) and `LoyaltyModule` for the points
 * reversal a refund triggers.
 */
@Module({
  // `BillingModule` for `SubscriptionEnforcementService`: approving a shop and
  // changing the subscription rule both decide whether shops are live.
  imports: [OrdersModule, LoyaltyModule, AuditModule, BillingModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    RefundsService,
    ApprovalsService,
    RetentionService,
    RetentionScheduler,
    SpecialtiesAdminService,
    SupportAdminService,
    ModerationService,
    AdminAccountsService,
  ],
  exports: [RefundsService, RetentionScheduler],
})
export class AdminModule {}
