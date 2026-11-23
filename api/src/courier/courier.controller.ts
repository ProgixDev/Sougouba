import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { reportCourierIssueSchema, type ReportCourierIssueInput } from '../admin/dto/admin.dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { pagedListSchema, queryBool } from '../catalog/dto/query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CouriersService } from './couriers.service.js';
import { DeliveryService } from './delivery.service.js';
import { DispatchScheduler } from './dispatch.scheduler.js';
import { DispatchService } from './dispatch.service.js';
import {
  applyCourierSchema,
  completeDeliverySchema,
  locationPingSchema,
  proofUploadSchema,
  setShiftSchema,
  signatureSchema,
  updateCourierSchema,
  type ApplyCourierInput,
  type CompleteDeliveryInput,
  type LocationPingInput,
  type ProofUploadInput,
  type SetShiftInput,
  type SignatureInput,
  type UpdateCourierInput,
} from './dto/courier.dto.js';

const earningsQuerySchema = z.object({
  // Up to ten years: "all time" on the history screen is a window like any other.
  days: z.coerce.number().int().min(1).max(3650).default(7),
});
type EarningsQuery = z.infer<typeof earningsQuerySchema>;
const runsQuerySchema = pagedListSchema.extend({
  /** History and earnings only care about runs that reached the door. */
  deliveredOnly: queryBool,
});
type RunsQuery = z.infer<typeof runsQuerySchema>;

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
    private readonly delivery: DeliveryService,
    /**
     * Only ever used for `nudge`, which runs a dispatch tick on hosts with no
     * always-on timer. A no-op on a VPS — see `dispatch.scheduler.ts`.
     */
    private readonly dispatcher: DispatchScheduler
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
  async setShift(@CurrentUser() userId: string, @Body(new ZodValidationPipe(setShiftSchema)) body: SetShiftInput) {
    const result = await this.couriers.setShift(userId, body);
    // A courier who just came online is the one thing a waiting order needs.
    await this.dispatcher.nudge();
    return result;
  }

  /** Keep-alive for a courier waiting for work, who has no run to ping against. */
  @Post('me/heartbeat')
  async heartbeat(@CurrentUser() userId: string, @Body(new ZodValidationPipe(locationPingSchema.partial())) body: Partial<LocationPingInput>) {
    const position = body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : undefined;
    const result = await this.couriers.heartbeat(userId, position);
    // The app heartbeats every 45 s while a courier waits for work, which makes
    // this the closest thing to a tick-tock a serverless deploy has.
    await this.dispatcher.nudge();
    return result;
  }

  @Get('me/earnings')
  earnings(@CurrentUser() userId: string, @Query(new ZodValidationPipe(earningsQuerySchema)) query: EarningsQuery) {
    return this.couriers.earnings(userId, query.days);
  }

  @Get('me/runs')
  runs(@CurrentUser() userId: string, @Query(new ZodValidationPipe(runsQuerySchema)) query: RunsQuery) {
    return this.couriers.runs(userId, query);
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
    // Before answering, not after: a tick is what makes this list current, and
    // this route exists precisely for a client that has just reconnected.
    await this.dispatcher.nudge();
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
    const result = await this.dispatch.decline(courierId, offerId);
    // Re-offer to the next courier now. Otherwise a declined order waits for
    // the next tick, which on serverless could be a minute away.
    await this.dispatcher.nudge();
    return result;
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

  /** A signed upload URL for the photo proof. The returned `path` is what `complete` takes as `imagePath`. */
  @Post('me/runs/:orderId/proof-upload')
  async proofUpload(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(proofUploadSchema)) body: ProofUploadInput
  ) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.createProofUpload(courierId, orderId, body);
  }

  /** The drawn signature, stored as an SVG the API writes. Returns the `imagePath` for `complete`. */
  @Post('me/runs/:orderId/signature')
  async signature(
    @CurrentUser() userId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(signatureSchema)) body: SignatureInput
  ) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.delivery.saveSignature(courierId, orderId, body);
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
