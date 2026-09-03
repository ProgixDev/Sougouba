import { Module } from '@nestjs/common';

import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ApprovalsService } from './approvals.service.js';
import { AuditModule } from './audit.module.js';
import { RefundsService } from './refunds.service.js';

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
  imports: [OrdersModule, LoyaltyModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, RefundsService, ApprovalsService],
  exports: [RefundsService],
})
export class AdminModule {}
