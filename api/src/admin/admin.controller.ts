import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { paginationSchema, type Pagination } from '../catalog/dto/query.dto.js';
import { AuditService } from './audit.service.js';
import { ANY_ADMIN, RequirePermission } from './permissions.js';
import {
  adminCouponQuerySchema,
  adminProductQuerySchema,
  adminReviewQuerySchema,
  adminRoleSchema,
  adminSearchQuerySchema,
  auditQuerySchema,
  cancelOrderAdminSchema,
  courierIssueQuerySchema,
  createAdminSchema,
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
  setAdminRoleSchema,
  supportQuerySchema,
  supportReplySchema,
  updateSettingsSchema,
  updateSpecialtySchema,
  userQuerySchema,
  type AdminCouponQuery,
  type AdminProductQuery,
  type AdminReviewQuery,
  type AdminRoleInput,
  type AdminSearchQuery,
  type AuditQuery,
  type CancelOrderAdminInput,
  type CourierIssueQuery,
  type CreateAdminInput,
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
  type SetAdminRoleInput,
  type SupportQuery,
  type SupportReplyInput,
  type UpdateSettingsInput,
  type UpdateSpecialtyInput,
  type UserQuery,
} from './dto/admin.dto.js';
import { RefundsService } from './refunds.service.js';
import { OrderCancellationService } from '../orders/order-cancellation.service.js';
import { ReceiptsService } from '../orders/receipts/receipts.service.js';
import { StalledOrdersService } from '../orders/stalled-orders.service.js';
import { SpecialtiesAdminService } from './specialties-admin.service.js';
import { SupportAdminService } from './support-admin.service.js';
import { ModerationService } from './moderation.service.js';
import { AdminAccountsService } from './admin-accounts.service.js';

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
    private readonly moderation: ModerationService,
    private readonly adminAccounts: AdminAccountsService,
    private readonly receipts: ReceiptsService,
    private readonly cancellation: OrderCancellationService,
    private readonly stalledOrders: StalledOrdersService
  ) {}

  @RequirePermission('dashboard.view')
  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  /**
   * Declared alongside `GET stats` rather than nested under it: find-my-way
   * resolves the static segment `overview` before any parameter, so the two
   * cannot shadow each other regardless of declaration order.
   */
  @RequirePermission('dashboard.view')
  @Get('stats/overview')
  overview(@Query(new ZodValidationPipe(overviewQuerySchema)) query: OverviewQuery) {
    return this.admin.overview(query.range);
  }

  @RequirePermission('orders.view')
  @Get('orders')
  orders(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.admin.listOrders(query);
  }

  /**
   * Orders that are packed and that no courier has taken, oldest first, with
   * the two delays that decide what happens to them. What the orders page puts
   * at the top: these are the ones waiting on a person.
   *
   * A static segment, so it cannot be read as `orders/:id`.
   */
  @RequirePermission('orders.view')
  @Get('orders/waiting-for-courier')
  ordersWaitingForCourier() {
    return this.stalledOrders.list();
  }

  /**
   * Orders a shop never answered and that the timer left alone — older than a
   * day, or automatic cancellation is off. Listed beside the ones waiting for a
   * courier, for the same reason: they need a person.
   */
  @RequirePermission('orders.view')
  @Get('orders/awaiting-shop')
  ordersAwaitingShop() {
    return this.stalledOrders.listUnanswered();
  }

  @RequirePermission('orders.view')
  @Get('orders/:id')
  order(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.orderDetail(id);
  }

  /**
   * Declared before any `@Get(':param')` on this controller — find-my-way
   * prefers a static segment, but keeping the order explicit means a future
   * parameterised route cannot quietly shadow it.
   */
  @RequirePermission('dashboard.view')
  @Get('search')
  search(@Query(new ZodValidationPipe(adminSearchQuerySchema)) query: AdminSearchQuery) {
    return this.admin.search(query);
  }

  // ── disputes ──────────────────────────────────────────────────────────────

  @RequirePermission('disputes.view')
  @Get('disputes')
  disputes(@Query(new ZodValidationPipe(disputeQuerySchema)) query: DisputeQuery) {
    return this.admin.listDisputes(query);
  }

  @RequirePermission('disputes.view')
  @Get('disputes/:orderId')
  dispute(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.admin.disputeDetail(orderId);
  }

  @RequirePermission('disputes.resolve')
  @Patch('disputes/:orderId/resolve')
  resolveDispute(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeInput
  ) {
    return this.admin.resolveDispute(adminId, orderId, body);
  }

  // ── courier issues ────────────────────────────────────────────────────────

  @RequirePermission('courier_issues.view')
  @Get('courier-issues')
  courierIssues(@Query(new ZodValidationPipe(courierIssueQuerySchema)) query: CourierIssueQuery) {
    return this.admin.listCourierIssues(query);
  }

  @RequirePermission('courier_issues.view')
  @Get('courier-issues/:orderId')
  courierIssue(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.admin.courierIssueDetail(orderId);
  }

  @RequirePermission('courier_issues.resolve')
  @Patch('courier-issues/:orderId/resolve')
  resolveCourierIssue(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(resolveCourierIssueSchema)) body: ResolveCourierIssueInput
  ) {
    return this.admin.resolveCourierIssue(adminId, orderId, body);
  }

  // ── approval queues ───────────────────────────────────────────────────────

  @RequirePermission('vendors.view')
  @Get('vendors')
  vendors(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.approvals.listVendors(query);
  }

  @RequirePermission('vendors.view')
  @Get('vendors/:id')
  vendor(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.vendorDetail(id);
  }

  @RequirePermission('vendors.decide')
  @Post('vendors/:id/approve')
  approveVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'approved', body);
  }

  @RequirePermission('vendors.decide')
  @Post('vendors/:id/reject')
  rejectVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'rejected', requireReason(body));
  }

  @RequirePermission('vendors.decide')
  @Post('vendors/:id/suspend')
  suspendVendor(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideVendor(adminId, id, 'suspended', requireReason(body));
  }

  @RequirePermission('couriers.view')
  @Get('couriers')
  couriers(@Query(new ZodValidationPipe(reviewQuerySchema)) query: ReviewQuery) {
    return this.approvals.listCouriers(query);
  }

  @RequirePermission('couriers.view')
  @Get('couriers/:id')
  courier(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.courierDetail(id);
  }

  @RequirePermission('couriers.decide')
  @Post('couriers/:id/approve')
  approveCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'approved', body);
  }

  @RequirePermission('couriers.decide')
  @Post('couriers/:id/reject')
  rejectCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'rejected', requireReason(body));
  }

  @RequirePermission('couriers.decide')
  @Post('couriers/:id/suspend')
  suspendCourier(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.decideCourier(adminId, id, 'suspended', requireReason(body));
  }

  @RequirePermission('users.view')
  @Get('users')
  users(@Query(new ZodValidationPipe(userQuerySchema)) query: UserQuery) {
    return this.approvals.listUsers(query);
  }

  @RequirePermission('users.view')
  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.approvals.userDetail(id);
  }

  /** Stop an account signing in or buying — a reason is required, and it is audited. */
  @RequirePermission('users.block')
  @Post('users/:id/block')
  blockUser(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.approvals.setUserBlocked(adminId, id, true, requireReason(body).reason);
  }

  @RequirePermission('users.block')
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
  @RequirePermission('support.view')
  @Get('support')
  supportInbox(@Query(new ZodValidationPipe(supportQuerySchema)) query: SupportQuery) {
    return this.supportAdmin.list(query);
  }

  @RequirePermission('support.view')
  @Get('support/:id')
  supportConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportAdmin.detail(id);
  }

  /** Answers in the customer's own thread, and pushes them. */
  @RequirePermission('support.reply')
  @Post('support/:id/reply')
  replySupport(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supportReplySchema)) body: SupportReplyInput
  ) {
    return this.supportAdmin.reply(adminId, id, body.content);
  }

  @RequirePermission('support.reply')
  @Post('support/:id/resolve')
  resolveSupport(@CurrentUser() adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.supportAdmin.resolve(adminId, id);
  }

  // ── insights: the KPIs above each list ────────────────────────────────────
  //
  // One route per area rather than `/insights/:area`, so each carries the
  // permission of the section it summarises.

  @RequirePermission('vendors.view')
  @Get('insights/vendors')
  vendorInsights() {
    return this.admin.insights('vendors');
  }

  @RequirePermission('couriers.view')
  @Get('insights/couriers')
  courierInsights() {
    return this.admin.insights('couriers');
  }

  @RequirePermission('orders.view')
  @Get('insights/orders')
  orderInsights() {
    return this.admin.insights('orders');
  }

  @RequirePermission('users.view')
  @Get('insights/users')
  userInsights() {
    return this.admin.insights('users');
  }

  @RequirePermission('disputes.view')
  @Get('insights/disputes')
  disputeInsights() {
    return this.admin.insights('disputes');
  }

  @RequirePermission('courier_issues.view')
  @Get('insights/courier-issues')
  courierIssueInsights() {
    return this.admin.insights('courier_issues');
  }

  @RequirePermission('support.view')
  @Get('insights/support')
  supportInsights() {
    return this.admin.insights('support');
  }

  @RequirePermission('moderation.view')
  @Get('insights/moderation')
  moderationInsights() {
    return this.admin.insights('moderation');
  }

  // ── administrator accounts ────────────────────────────────────────────────

  /** Who is signed in, their role and permissions — what the dashboard draws itself from. */
  @RequirePermission(ANY_ADMIN)
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.adminAccounts.me(userId);
  }

  /**
   * Your own lines in the audit log — for any administrator, with or without
   * `audit.view`: what you did yourself is not someone else's record.
   */
  @RequirePermission(ANY_ADMIN)
  @Get('me/activity')
  myActivity(@CurrentUser() userId: string, @Query(new ZodValidationPipe(paginationSchema)) query: Pagination) {
    return this.audit.list({ ...query, actorId: userId });
  }

  @RequirePermission('admins.view')
  @Get('roles')
  roles() {
    return this.adminAccounts.listRoles();
  }

  /** The catalogue of permissions a custom role can hold. */
  @RequirePermission('admins.view')
  @Get('permissions')
  permissionCatalogue() {
    return this.adminAccounts.permissionCatalogue();
  }

  @RequirePermission('admins.manage')
  @Post('roles')
  createRole(@CurrentUser() actorId: string, @Body(new ZodValidationPipe(adminRoleSchema)) body: AdminRoleInput) {
    return this.adminAccounts.createRole(actorId, body);
  }

  /** Custom roles only — the five built-in ones cannot be changed. */
  @RequirePermission('admins.manage')
  @Patch('roles/:id')
  updateRole(
    @CurrentUser() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adminRoleSchema)) body: AdminRoleInput
  ) {
    return this.adminAccounts.updateRole(actorId, id, body);
  }

  /** Custom roles nobody holds. */
  @RequirePermission('admins.manage')
  @Delete('roles/:id')
  @HttpCode(204)
  deleteRole(@CurrentUser() actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminAccounts.deleteRole(actorId, id);
  }

  @RequirePermission('admins.view')
  @Get('admins')
  admins() {
    return this.adminAccounts.list();
  }

  /** A fresh account with a one-time password, returned once — see `AdminAccountsService`. */
  @RequirePermission('admins.manage')
  @Post('admins')
  createAdmin(@CurrentUser() actorId: string, @Body(new ZodValidationPipe(createAdminSchema)) body: CreateAdminInput) {
    return this.adminAccounts.create(actorId, body);
  }

  /** Moves an administrator to another role — refused if nobody could manage admins after. */
  @RequirePermission('admins.manage')
  @Patch('admins/:id/role')
  setAdminRole(
    @CurrentUser() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setAdminRoleSchema)) body: SetAdminRoleInput
  ) {
    return this.adminAccounts.setRole(actorId, id, body.roleId);
  }

  /** Never yourself, and never the last administrator who can manage admins. */
  @RequirePermission('admins.manage')
  @Post('admins/:id/revoke')
  @HttpCode(204)
  revokeAdmin(
    @CurrentUser() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.adminAccounts.revoke(actorId, id, body.reason);
  }

  // ── moderation ────────────────────────────────────────────────────────────

  @RequirePermission('moderation.view')
  @Get('reviews')
  reviews(@Query(new ZodValidationPipe(adminReviewQuerySchema)) query: AdminReviewQuery) {
    return this.moderation.listReviews(query);
  }

  /** Hide/show the comment, remove/restore the review. Hiding or removing needs a reason. */
  @RequirePermission('moderation.act')
  @Post('reviews/:orderId/moderate')
  @HttpCode(204)
  moderateReview(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) body: ModerateReviewInput
  ) {
    return this.moderation.moderateReview(adminId, orderId, body);
  }

  @RequirePermission('moderation.view')
  @Get('coupons')
  coupons(@Query(new ZodValidationPipe(adminCouponQuerySchema)) query: AdminCouponQuery) {
    return this.moderation.listCoupons(query);
  }

  /** Ends a merchant's code now. A reason is required. */
  @RequirePermission('moderation.act')
  @Post('coupons/:id/deactivate')
  @HttpCode(204)
  deactivateCoupon(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.moderation.deactivateCoupon(adminId, id, requireReason(body).reason);
  }

  @RequirePermission('moderation.view')
  @Get('products')
  products(@Query(new ZodValidationPipe(adminProductQuerySchema)) query: AdminProductQuery) {
    return this.moderation.listProducts(query);
  }

  /** Out of every shopper read, checkout included; the merchant still sees it, marked. A reason is required. */
  @RequirePermission('moderation.act')
  @Post('products/:id/hide')
  @HttpCode(204)
  hideProduct(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema)) body: ReviewDecisionInput
  ) {
    return this.moderation.setProductHidden(adminId, id, true, requireReason(body).reason);
  }

  @RequirePermission('moderation.act')
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
  @RequirePermission('specialties.view')
  @Get('specialties')
  specialties() {
    return this.specialtiesAdmin.list();
  }

  @RequirePermission('specialties.manage')
  @Post('specialties')
  createSpecialty(
    @CurrentUser() adminId: string,
    @Body(new ZodValidationPipe(createSpecialtySchema)) body: CreateSpecialtyInput
  ) {
    return this.specialtiesAdmin.create(adminId, body);
  }

  /** Rename, reorder, retire or bring back — a rename reaches the shops that use it. */
  @RequirePermission('specialties.manage')
  @Patch('specialties/:id')
  updateSpecialty(
    @CurrentUser() adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSpecialtySchema)) body: UpdateSpecialtyInput
  ) {
    return this.specialtiesAdmin.update(adminId, id, body);
  }

  // ── platform settings ─────────────────────────────────────────────────────

  @RequirePermission('settings.view')
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
  @RequirePermission('settings.manage')
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
  @RequirePermission('audit.view')
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
  @RequirePermission('orders.refund')
  @Post('orders/:orderId/refund')
  refund(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(refundOrderSchema)) body: RefundOrderInput
  ) {
    return this.refunds.refundOrder(adminId, orderId, body);
  }

  /**
   * Cancel an order that is still in flight — at any step before delivery,
   * courier on the road included. The shopper is refunded in full, the stock
   * and any points or coupon come back, and a courier carrying it is released.
   * Audited as `order.cancel`, with the reason.
   *
   * Under `orders.refund`: cancelling *is* refunding, and a role trusted with
   * one is the role trusted with the other. A delivered order is refused here
   * and belongs to the route above.
   */
  @RequirePermission('orders.refund')
  @Post('orders/:orderId/cancel')
  @HttpCode(200)
  cancelOrder(
    @CurrentUser() adminId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(cancelOrderAdminSchema)) body: CancelOrderAdminInput
  ) {
    return this.cancellation.byAdmin(adminId, orderId, body.reason);
  }

  // ── receipts ──────────────────────────────────────────────────────────────

  /**
   * A short-lived link to an order's receipt PDF — the same document the
   * shopper opens from the app. A link rather than the file because the browser
   * tab that shows a PDF cannot send this session's token; see
   * `orders/receipts/receipt-link.ts`.
   */
  @RequirePermission('orders.view')
  @Get('orders/:orderId/receipt-link')
  @Header('Cache-Control', 'no-store')
  receiptLink(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.receipts.linkForAdmin(orderId, 'fr');
  }

  /**
   * Email the receipt to the shopper again — "I never got it" is a support
   * call, and this is its answer. Audited as `order.receipt_resend`.
   *
   * Under `orders.view` and not a permission of its own: it sends the shopper
   * their own receipt at their own address and changes nothing about the
   * order. What stops it being leaned on is the one-minute cooldown in
   * `ReceiptsService.resend`.
   */
  @RequirePermission('orders.view')
  @Post('orders/:orderId/receipt-email')
  resendReceipt(@CurrentUser() adminId: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.receipts.resend(adminId, orderId);
  }
}
