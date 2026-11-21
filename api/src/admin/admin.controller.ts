import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { AdminService } from './admin.service.js';
import { ApprovalsService } from './approvals.service.js';
import { AuditService } from './audit.service.js';
import {
  adminCouponQuerySchema,
  adminProductQuerySchema,
  adminReviewQuerySchema,
  adminSearchQuerySchema,
  auditQuerySchema,
  courierIssueQuerySchema,
  createSpecialtySchema,
  disputeQuerySchema,
  moderateReviewSchema,
  orderListQuerySchema,
  overviewQuerySchema,
  refundOrderSchema,
  resolveCourierIssueSchema,
  resolveDisputeSchema,
  reviewDecisionSchema,
  reviewQuerySchema,
  supportQuerySchema,
  supportReplySchema,
  updateSettingsSchema,
  updateSpecialtySchema,
  userQuerySchema,
  type AdminCouponQuery,
  type AdminProductQuery,
  type AdminReviewQuery,
  type AdminSearchQuery,
  type AuditQuery,
  type CourierIssueQuery,
  type CreateSpecialtyInput,
  type DisputeQuery,
  type ModerateReviewInput,
  type OrderListQuery,
  type OverviewQuery,
  type RefundOrderInput,
  type ResolveCourierIssueInput,
  type ResolveDisputeInput,
  type ReviewDecisionInput,
  type ReviewQuery,
  type SupportQuery,
  type SupportReplyInput,
  type UpdateSettingsInput,
  type UpdateSpecialtyInput,
  type UserQuery,
} from './dto/admin.dto.js';
import { RefundsService } from './refunds.service.js';
import { SpecialtiesAdminService } from './specialties-admin.service.js';
import { SupportAdminService } from './support-admin.service.js';
import { ModerationService } from './moderation.service.js';

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
    private readonly platformSettings: SettingsService,
    private readonly audit: AuditService,
    private readonly specialtiesAdmin: SpecialtiesAdminService,
    private readonly supportAdmin: SupportAdminService,
    private readonly moderation: ModerationService
  ) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  /**
   * Declared alongside `GET stats` rather than nested under it: find-my-way
   * resolves the static segment `overview` before any parameter, so the two
   * cannot shadow each other regardless of declaration order.
   */
  @Get('stats/overview')
  overview(@Query(new ZodValidationPipe(overviewQuerySchema)) query: OverviewQuery) {
    return this.admin.overview(query.range);
  }

  @Get('orders')
  orders(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.admin.listOrders(query);
  }

  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.orderDetail(id);
  }

  /**
   * Declared before any `@Get(':param')` on this controller — find-my-way
   * prefers a static segment, but keeping the order explicit means a future
   * parameterised route cannot quietly shadow it.
   */
  @Get('search')
  search(@Query(new ZodValidationPipe(adminSearchQuerySchema)) query: AdminSearchQuery) {
    return this.admin.search(query);
  }

  // ── disputes ──────────────────────────────────────────────────────────────

  @Get('disputes')
  disputes(@Query(new ZodValidationPipe(disputeQuerySchema)) query: DisputeQuery) {
    return this.admin.listDisputes(query);
  }

  @Get('disputes/:orderId')
  dispute(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.admin.disputeDetail(orderId);
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

  @Get('courier-issues/:orderId')
  courierIssue(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.admin.courierIssueDetail(orderId);
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

  @Get('vendors/:id')
  vendor(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.vendorDetail(id);
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

  @Get('couriers/:id')
  courier(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.courierDetail(id);
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

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.userDetail(id);
  }

  /** Stop an account signing in or buying — a reason is required, and it is audited. */
  @Post('users/:id/block')
  blockUser(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.setUserBlocked(adminId, id, true, requireReason(body).reason);
  }

  @Post('users/:id/unblock')
  unblockUser(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.setUserBlocked(adminId, id, false, body.reason);
  }

  // ── support inbox ─────────────────────────────────────────────────────────

  /** Conversations customers handed to the team — waiting ones first, oldest activity on top. */
  @Get('support')
  supportInbox(@Query(new ZodValidationPipe(supportQuerySchema)) query: SupportQuery) {
    return this.supportAdmin.list(query);
  }

  @Get('support/:id')
  supportConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportAdmin.detail(id);
  }

  /** Answers in the customer's own thread, and pushes them. */
  @Post('support/:id/reply')
  replySupport(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supportReplySchema)) body: SupportReplyInput
  ) {
    return this.supportAdmin.reply(adminId, id, body.content);
  }

  @Post('support/:id/resolve')
  resolveSupport(@CurrentUser() adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.supportAdmin.resolve(adminId, id);
  }

  // ── moderation ────────────────────────────────────────────────────────────

  @Get('reviews')
  reviews(@Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.moderation.listReviews(query);
  }

  /** Hide/show the comment, remove/restore the review. Hiding or removing needs a reason. */
  @Post('reviews/:orderId/moderate')
  @HttpCode(204)
  moderateReview(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) body: ModerateReviewInput
  ) {
    return this.moderation.moderateReview(adminId, orderId, body);
  }

  @Get('coupons')
  coupons(@Query(new ZodValidationPipe(adminCouponQuerySchema)) query: AdminCouponQuery) {
    return this.moderation.listCoupons(query);
  }

  /** Ends a merchant's code now. A reason is required. */
  @Post('coupons/:id/deactivate')
  @HttpCode(204)
  deactivateCoupon(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.moderation.deactivateCoupon(adminId, id, requireReason(body).reason);
  }

  @Get('products')
  products(@Query(new ZodValidationPipe(adminProductQuerySchema)) query: AdminProductQuery) {
    return this.moderation.listProducts(query);
  }

  /** Out of every shopper read, checkout included; the merchant still sees it, marked. A reason is required. */
  @Post('products/:id/hide')
  @HttpCode(204)
  hideProduct(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.moderation.setProductHidden(adminId, id, true, requireReason(body).reason);
  }

  @Post('products/:id/unhide')
  @HttpCode(204)
  unhideProduct(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.moderation.setProductHidden(adminId, id, false, body.reason);
  }

  // ── shop specialties ──────────────────────────────────────────────────────

  /** Every entry, retired ones included, with how many shops use each. */
  @Get('specialties')
  specialties() {
    return this.specialtiesAdmin.list();
  }

  @Post('specialties')
  createSpecialty(
    @CurrentUser() adminId: string,
    @Body(new ZodValidationPipe(createSpecialtySchema)) body: CreateSpecialtyInput
  ) {
    return this.specialtiesAdmin.create(adminId, body);
  }

  /** Rename, reorder, retire or bring back — a rename reaches the shops that use it. */
  @Patch('specialties/:id')
  updateSpecialty(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSpecialtySchema)) body: UpdateSpecialtyInput
  ) {
    return this.specialtiesAdmin.update(adminId, id, body);
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
  updateSettings(
    @CurrentUser() adminId: string,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput
  ) {
    return this.platformSettings.update(adminId, body);
  }

  // ── audit trail ───────────────────────────────────────────────────────────

  /**
   * Who did what, and when.
   *
   * Read-only by design and append-only in the database — there is no route to
   * amend or delete an entry, and a trigger refuses both even for the role the
   * API connects as. See `admin_audit_log` in `db/schema/admin.ts`.
   */
  @Get('audit-log')
  auditLog(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(query);
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
