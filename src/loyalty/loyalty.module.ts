import { Module } from '@nestjs/common';

import { CouponsService } from './coupons.service.js';
import { LoyaltyController } from './loyalty.controller.js';
import { LoyaltyService } from './loyalty.service.js';
import { SettingsService } from './settings.service.js';

/**
 * Points, referrals and coupons.
 *
 * Exported wholesale because `OrdersModule` needs all three at checkout: the
 * balance to clamp a redemption against, the debit to write once the order
 * exists, and the coupon to price and then mark used. `SettingsService` goes
 * with them — the rates it serves are what the pricing rules read.
 */
@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService, CouponsService, SettingsService],
  exports: [LoyaltyService, CouponsService, SettingsService],
})
export class LoyaltyModule {}
