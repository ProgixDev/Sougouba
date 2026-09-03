import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { paginationSchema } from '../catalog/dto/query.dto.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { AdminService } from './admin.service.js';
import { ApprovalsService } from './approvals.service.js';
import {
  courierIssueQuerySchema,
  disputeQuerySchema,
  refundOrderSchema,
  resolveCourierIssueSchema,
  resolveDisputeSchema,
  reviewDecisionSchema,
  reviewQuerySchema,
  updateSettingsSchema,
  userQuerySchema,
  type CourierIssueQuery,
  type DisputeQuery,
  type RefundOrderInput,
  type ResolveCourierIssueInput,
  type ResolveDisputeInput,
  type ReviewDecisionInput,
  type ReviewQuery,
  type UpdateSettingsInput,
  type UserQuery,
} from './dto/admin.dto.js';
import { RefundsService } from './refunds.service.js';

type Pagination = z.infer<typeof paginationSchema>;

/**
 * A rejection or suspension without a stated reason is refused.
 *
 * Enforced here rather than in the schema because approve/reject/suspend share
 * one body shape and only the route knows which decision it is making — an
 * approval genuinely needs no explanation, the other two always do.
 */
function requireReason(body: ReviewDecisionInput): ReviewDecisionInput {
  if (!body.reason) throw new BadRequestException('Un motif est requis pour cette décision');
  return body;
}

/**
 * The back office. **Guard order matters**: `SupabaseAuthGuard` proves who is
 * calling and sets `request.userId`, then `AdminGuard` reads it. Reversed, the
 * role check would run against nothing.
 *
 * Every route here reads or writes across accounts the caller does not own,
 * which is exactly why the role behind it cannot be self-assigned — see
 * `AdminGuard`.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly refunds: RefundsService,
    private readonly approvals: ApprovalsService,
    private readonly platformSettings: SettingsService
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('orders')
  orders(@Query(new ZodValidationPipe(paginationSchema)) query: Pagination) {
    return this.admin.recentOrders(query.limit, query.offset);
  }

  // ── disputes ──────────────────────────────────────────────────────────────

  @Get('disputes')
  disputes(@Query(new ZodValidationPipe(disputeQuerySchema)) query: DisputeQuery) {
    return this.admin.listDisputes(query);
  }

  @Patch('disputes/:orderId/resolve')
  resolveDispute(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeInput
  ) {
    return this.admin.resolveDispute(adminId, orderId, body);
  }

  // ── courier issues ────────────────────────────────────────────────────────

  @Get('courier-issues')
  courierIssues(@Query(new ZodValidationPipe(courierIssueQuerySchema)) query: CourierIssueQuery) {
    return this.admin.listCourierIssues(query);
  }

  @Patch('courier-issues/:orderId/resolve')
  resolveCourierIssue(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(resolveCourierIssueSchema)) body: ResolveCourierIssueInput
  ) {
    return this.admin.resolveCourierIssue(adminId, orderId, body);
  }

  // ── approval queues ───────────────────────────────────────────────────────

  @Get('vendors')
  vendors(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.approvals.listVendors(query);
  }

  @Post('vendors/:id/approve')
  approveVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'approved', body);
  }

  @Post('vendors/:id/reject')
  rejectVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'rejected', requireReason(body));
  }

  @Post('vendors/:id/suspend')
  suspendVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'suspended', requireReason(body));
  }

  @Get('couriers')
  couriers(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.approvals.listCouriers(query);
  }

  @Post('couriers/:id/approve')
  approveCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'approved', body);
  }

  @Post('couriers/:id/reject')
  rejectCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'rejected', requireReason(body));
  }

  @Post('couriers/:id/suspend')
  suspendCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'suspended', requireReason(body));
  }

  @Get('users')
  users(@Query(new ZodValidationPipe(userQuerySchema)) query: UserQuery) {
    return this.approvals.listUsers(query);
  }

  // ── platform settings ─────────────────────────────────────────────────────

  @Get('settings')
  settings() {
    return this.platformSettings.all();
  }

  /**
   * The editable version of what used to be constants in the mobile app's
   * `data/loyalty.ts` and `lib/monetization.ts` — including the genuine
   * "journée points doublés" toggle the brief asked for, which shipped as a
   * hardcoded `false` with a comment saying the button belonged to a back
   * office. This is that button.
   */
  @Patch('settings')
  updateSettings(@Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput) {
    return this.platformSettings.update(body);
  }

  // ── money ─────────────────────────────────────────────────────────────────

  /**
   * A refund outside a dispute — an order the merchant could not fulfil, or the
   * sold-out-mid-checkout case `OrdersService.place` logs as REFUND REQUIRED.
   *
   * Note the orphan case that case can also produce — a payment that succeeded
   * with **no order row at all**, because the order transaction rolled back — is
   * not reachable from here, since there is nothing to address. Those are logged
   * with their PaymentIntent id and refunded from the Stripe dashboard; the
   * webhook's reconciliation warning is what surfaces them.
   */
  @Post('orders/:orderId/refund')
  refund(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(refundOrderSchema)) body: RefundOrderInput
  ) {
    return this.refunds.refundOrder(adminId, orderId, body);
  }
}
