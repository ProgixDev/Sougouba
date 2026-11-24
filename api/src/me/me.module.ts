import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  // For `SubscriptionsService`: deleting a merchant's account has to stop
  // their monthly subscription, or a card keeps being charged for a shop that
  // no longer exists.
  imports: [BillingModule],
  controllers: [MeController],
  providers: [MeService, AccountDeletionService],
})
export class MeModule {}
