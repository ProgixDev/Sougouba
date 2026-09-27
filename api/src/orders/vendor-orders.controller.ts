import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  advanceStatusSchema,
  orderQuerySchema,
  replyDisputeSchema,
  type AdvanceStatusInput,
  type OrderQuery,
  type ReplyDisputeInput,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * The merchant's order queue — CDC addendum §04's "Espace commerçant".
 *
 * Scoped to the shop owned by the caller, with no `:vendorId` anywhere, for the
 * same reason `VendorMeController` has none: there is no id for a caller to
 * substitute.
 */
@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('vendors/me/orders')
export class VendorOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query(new ZodValidationPipe(orderQuerySchema)) query: OrderQuery) {
    return this.orders.listForVendorOwner(userId, query);
  }

  @Get(':id')
  byId(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.byId(userId, id, 'merchant');
  }

  /**
   * Accept, start preparing, mark ready — or cancel while the bag is still in
   * the shop. The courier's two steps are refused here; they belong to Phase
   * 5's endpoints, which also write the pickup time, the proof and the payout.
   */
  @Patch(':id/status')
  advance(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advanceStatusSchema)) body: AdvanceStatusInput
  ) {
    return this.orders.advanceAsMerchant(userId, id, body.status);
  }

  @Post(':id/dispute/reply')
  replyToDispute(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replyDisputeSchema)) body: ReplyDisputeInput
  ) {
    return this.orders.replyToDispute(userId, id, body);
  }
}
