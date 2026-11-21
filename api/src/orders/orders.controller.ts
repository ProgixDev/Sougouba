import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { DispatchScheduler } from '../courier/dispatch.scheduler.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import {
  cartSchema,
  openDisputeSchema,
  orderQuerySchema,
  placeOrderSchema,
  submitReviewSchema,
  type CartInput,
  type OpenDisputeInput,
  type OrderQuery,
  type PlaceOrderInput,
  type SubmitReviewInput,
} from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

/**
 * The shopper's side of checkout, in the order it happens:
 *
 *   POST /orders/quote           → what this basket costs, priced server-side
 *   POST /orders/payment-intent  → a Stripe intent for exactly that amount
 *   (the app confirms it in the payment sheet)
 *   POST /orders                 → the order, written only once Stripe agrees
 *
 * Three calls rather than one because the middle step belongs to Stripe's SDK
 * on the device — card details never touch this API, which is what keeps it out
 * of PCI scope.
 */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    /** Only for `nudge` — a no-op unless this is a serverless deploy. */
    private readonly dispatcher: DispatchScheduler
  ) {}

  /** Declared before `:id` — otherwise `quote` is matched as an order id and 400s on the uuid pipe. */
  @Post('quote')
  quote(@CurrentUser() userId: string, @Body(new ZodValidationPipe(cartSchema)) body: CartInput) {
    return this.orders.quoteFor(userId, body);
  }

  @Post('payment-intent')
  paymentIntent(@CurrentUser() userId: string, @Body(new ZodValidationPipe(cartSchema)) body: CartInput) {
    return this.orders.createPaymentIntent(userId, body);
  }

  @Post()
  async place(@CurrentUser() userId: string, @Body(new ZodValidationPipe(placeOrderSchema)) body: PlaceOrderInput) {
    const order = await this.orders.place(userId, body);
    // The order exists and is paid; a courier should hear about it now rather
    // than whenever the next tick happens to come round.
    await this.dispatcher.nudge();
    return order;
  }

  @Get()
  list(@CurrentUser() userId: string, @Query(new ZodValidationPipe(orderQuerySchema)) query: OrderQuery) {
    return this.orders.listForCustomer(userId, query);
  }

  /** Orders placed and money spent, over every order — the profile's two figures. Before `:id`. */
  @Get('stats')
  stats(@CurrentUser() userId: string) {
    return this.orders.customerStats(userId);
  }

  @Get(':id')
  byId(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.byId(userId, id, 'customer');
  }

  /**
   * Where the courier carrying this order was last seen — the shopper's
   * tracking map. `null` when the courier's app has not pinged yet; the map
   * says so rather than inventing a position.
   */
  @Get(':id/courier-location')
  courierLocation(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.courierLocation(userId, id);
  }

  @Post(':id/dispute')
  openDispute(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(openDisputeSchema)) body: OpenDisputeInput
  ) {
    return this.orders.openDispute(userId, id, body);
  }

  @Post(':id/review')
  submitReview(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitReviewSchema)) body: SubmitReviewInput
  ) {
    return this.orders.submitReview(userId, id, body);
  }
}
