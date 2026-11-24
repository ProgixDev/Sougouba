import { Module } from '@nestjs/common';

import { AdminModule } from '../admin/admin.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { CourierModule } from '../courier/courier.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { CronController } from './cron.controller.js';
import { CronGuard } from './cron.guard.js';

/**
 * Imports the three modules that own a scheduler and exposes their jobs over
 * HTTP. Nothing imports this module back, so it adds no cycles.
 */
@Module({
  imports: [CourierModule, BillingModule, AdminModule, OrdersModule],
  controllers: [CronController],
  providers: [CronGuard],
})
export class CronModule {}
