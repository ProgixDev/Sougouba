import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { reportCourierIssueSchema, type ReportCourierIssueInput } from '../admin/dto/admin.dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { paginationSchema } from '../catalog/dto/query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CouriersService } from './couriers.service.js';
import { DeliveryService } from './delivery.service.js';
import { DispatchService } from './dispatch.service.js';
import {
  applyCourierSchema,
  completeDeliverySchema,
  locationPingSchema,
  setShiftSchema,
  updateCourierSchema,
  type ApplyCourierInput,
  type CompleteDeliveryInput,
  type LocationPingInput,
  type SetShiftInput,
  type UpdateCourierInput,
} from './dto/courier.dto.js';

const earningsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
type EarningsQuery = z.infer<typeof earningsQuerySchema>;
type RunsQuery = z.infer<typeof paginationSchema>;

/**
 * Everything a courier does, scoped to the file behind their own token. No
 * `:courierId` anywhere, for the same reason the merchant routes carry no
 * `:vendorId`: there is no id for a caller to substitute.
 */
@ApiTags('courier')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('couriers')
export class CourierController {
  constructor(
    private readonly couriers: CouriersService,
    private readonly dispatch: DispatchService,
    private readonly delivery: DeliveryService
  ) {}

  @Post('apply')
  apply(@CurrentUser() userId: string, @Body(new ZodValidationPipe(applyCourierSchema)) body: ApplyCourierInput) {
    return this.couriers.apply(userId, body);
  }

  @Get('me')
  mine(@CurrentUser() userId: string) {
    return this.couriers.mine(userId);
  }

  @Patch('me')
  update(@CurrentUser() userId: string, @Body(new ZodValidationPipe(updateCourierSchema)) body: UpdateCourierInput) {
    return this.couriers.update(userId, body);
  }

  /** Going on or off shift. Only an approved file may go online. */
  @Post('me/shift')
  setShift(@CurrentUser() userId: string, @Body(new ZodValidationPipe(setShiftSchema)) body: SetShiftInput) {
    return this.couriers.setShift(userId, body);
  }

  /** Keep-alive for a courier waiting for work, who has no run to ping against. */
  @Post('me/heartbeat')
  heartbeat(@CurrentUser() userId: string, @Body(new ZodValidationPipe(locationPingSchema.partial())) body: Partial<LocationPingInput>) {
    const position = body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    return this.couriers.heartbeat(userId, position);
  }

  @Get('me/earnings')
  earnings(@CurrentUser() userId: string, @Query(new ZodValidationPipe(earningsQuerySchema)) query: EarningsQuery) {
    return this.couriers.earnings(userId, query.days);
  }

  @Get('me/runs')
  runs(@CurrentUser() userId: string, @Query(new ZodValidationPipe(paginationSchema)) query: RunsQuery) {
    return this.couriers.runs(userId, query.limit, query.offset);
  }

  // ── dispatch ──────────────────────────────────────────────────────────────

  /**
   * The courier's live offers.
   *
   * A polling fallback, not the primary channel: the app subscribes to its own
   * `dispatch_offers` rows over Supabase Realtime, so an offer arrives as a
   * push rather than being waited for. This exists for the first load and for
   * a client whose socket dropped.
   */
  @Get('me/offers')
  async offers(@CurrentUser() userId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.dispatch.pendingOffersFor(courierId);
  }

  @Post('me/offers/:id/accept')
  async accept(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) offerId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.dispatch.accept(courierId, offerId);
  }

  @Post('me/offers/:id/decline')
  async decline(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) offerId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.dispatch.decline(courierId, offerId);
  }

  // ── carrying a run ────────────────────────────────────────────────────────

  @Get('me/runs/:orderId')
  async run(@CurrentUser() userId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.run(courierId, orderId);
  }

  @Post('me/runs/:orderId/pickup')
  async pickup(@CurrentUser() userId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.markPickedUp(courierId, orderId);
  }

  @Post('me/runs/:orderId/complete')
  async complete(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(completeDeliverySchema)) body: CompleteDeliveryInput
  ) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.complete(courierId, orderId, body);
  }

  /** Something stopped the delivery. The run stays open; an administrator picks it up (Phase 6). */
  @Post('me/runs/:orderId/issue')
  async reportIssue(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(reportCourierIssueSchema)) body: ReportCourierIssueInput
  ) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.reportIssue(courierId, orderId, body);
  }

  @Post('me/runs/:orderId/location')
  async location(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(locationPingSchema)) body: LocationPingInput
  ) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.recordLocation(courierId, orderId, body);
  }
}
