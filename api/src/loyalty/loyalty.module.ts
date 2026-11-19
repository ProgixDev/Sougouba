import { Module } from '@nestjs/common';

import { AuditModule } from '../admin/audit.module.js';
import { CouponsService } from './coupons.service.js';
import { LoyaltyController } from './loyalty.controller.js';
import { MerchantCouponsController } from './merchant-coupons.controller.js';
import { MerchantCouponsService } from './merchant-coupons.service.js';
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
  // For `SettingsService`, which records who changed a rate. See `AuditModule`.
  imports: [AuditModule],
  controllers: [LoyaltyController, MerchantCouponsController],
  providers: [LoyaltyService, CouponsService, MerchantCouponsService, SettingsService],
  exports: [LoyaltyService, CouponsService, SettingsService],
})
export class LoyaltyModule {}
