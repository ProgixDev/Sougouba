import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { createCouponSchema, type CreateCouponInput } from './dto/coupon.dto.js';
import { MerchantCouponsService } from './merchant-coupons.service.js';

/**
 * A merchant's promo codes. Like `VendorMeController`, there is no `:vendorId`
 * anywhere in here: the shop is resolved from the token, so there is no id for
 * a caller to substitute.
 */
@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('vendors/me/coupons')
export class MerchantCouponsController {
  constructor(private readonly coupons: MerchantCouponsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.coupons.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(new ZodValidationPipe(createCouponSchema)) body: CreateCouponInput) {
    return this.coupons.create(userId, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.deactivate(userId, id);
  }
}
