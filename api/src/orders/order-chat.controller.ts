import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CouriersService } from '../courier/couriers.service.js';
import { sendOrderMessageSchema, type SendOrderMessageInput } from './dto/order.dto.js';
import { OrderChatService } from './order-chat.service.js';

/** The shopper's side of an order's chat with its courier. */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('orders/:id/messages')
export class CustomerChatController {
  constructor(private readonly chat: OrderChatService) {}

  @Get()
  async thread(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) orderId: string) {
    return this.chat.thread(await this.chat.forCustomer(userId, orderId));
  }

  @Post()
  async send(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(sendOrderMessageSchema)) body: SendOrderMessageInput
  ) {
    return this.chat.send(await this.chat.forCustomer(userId, orderId), body.body);
  }

  @Post('read')
  async read(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) orderId: string) {
    return this.chat.markRead(await this.chat.forCustomer(userId, orderId));
  }
}

/**
 * The courier's side, under their runs like everything else they do. Lives in
 * this module rather than `CourierModule`, which cannot import this one without
 * a cycle.
 */
@ApiTags('courier')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('couriers/me/runs/:orderId/messages')
export class CourierChatController {
  constructor(
    private readonly chat: OrderChatService,
    private readonly couriers: CouriersService
  ) {}

  @Get()
  async thread(@CurrentUser() userId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.chat.thread(await this.context(userId, orderId));
  }

  @Post()
  async send(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(sendOrderMessageSchema)) body: SendOrderMessageInput
  ) {
    return this.chat.send(await this.context(userId, orderId), body.body);
  }

  @Post('read')
  async read(@CurrentUser() userId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.chat.markRead(await this.context(userId, orderId));
  }

  private async context(userId: string, orderId: string) {
    return this.chat.forCourier(await this.couriers.courierIdFor(userId), orderId);
  }
}
