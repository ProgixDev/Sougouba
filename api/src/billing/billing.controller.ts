import { Body, Controller, Get, Post, Query, Redirect, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { RequirePermission } from '../admin/permissions.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CouriersService } from '../courier/couriers.service.js';
import { AnalyticsService } from './analytics.service.js';
import { ConnectService } from './connect.service.js';
import { PayoutsService } from './payouts.service.js';

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

/**
 * Where the onboarding flow sends the browser back to.
 *
 * Both are required and both are validated as URLs: Stripe redirects to
 * whatever it is given, so an unvalidated value here is an open redirect
 * wearing a payments URL.
 */
const onboardSchema = z.object({
  returnUrl: z.url('URL de retour requise'),
  refreshUrl: z.url('URL de reprise requise'),
});
type OnboardInput = z.infer<typeof onboardSchema>;

@ApiTags('merchant')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('vendors/me')
export class MerchantBillingController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly connect: ConnectService
  ) {}

  /** The merchant dashboard's numbers, computed server-side instead of shipped as raw rows. */
  @Get('analytics')
  analyticsFor(@CurrentUser() userId: string, @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery) {
    return this.analytics.forOwner(userId, query.days);
  }

  /** The live commission rate and monthly subscription — the app's hardcoded pair is only a loading fallback. */
  @Get('plan')
  plan() {
    return this.analytics.plan();
  }

  @Post('stripe/onboard')
  onboard(@CurrentUser() userId: string, @Body(new ZodValidationPipe(onboardSchema)) body: OnboardInput) {
    return this.connect.onboardVendor(userId, body.returnUrl, body.refreshUrl);
  }

  @Get('stripe/status')
  status(@CurrentUser() userId: string) {
    return this.connect.vendorStatus(userId);
  }
}

@ApiTags('courier')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('couriers/me')
export class CourierBillingController {
  constructor(
    private readonly connect: ConnectService,
    private readonly payouts: PayoutsService,
    private readonly couriers: CouriersService
  ) {}

  /**
   * Replaces the bank-details form entirely.
   *
   * The mobile app's courier signup collects a transit and account number as
   * plain strings; this API never accepts them and never stores them. Stripe's
   * hosted onboarding collects the banking, and what comes back is an id.
   */
  @Post('stripe/onboard')
  onboard(@CurrentUser() userId: string, @Body(new ZodValidationPipe(onboardSchema)) body: OnboardInput) {
    return this.connect.onboardCourier(userId, body.returnUrl, body.refreshUrl);
  }

  @Get('stripe/status')
  status(@CurrentUser() userId: string) {
    return this.connect.courierStatus(userId);
  }

  /** What is owed but not yet paid — the real version of `pendingPayoutCad`, which never moved a cent. */
  @Get('payouts/pending')
  async pending(@CurrentUser() userId: string) {
    const courierId = await this.couriers.courierIdFor(userId);
    return this.payouts.pendingFor(courierId);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, AdminGuard)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  /**
   * Run the weekly batch by hand.
   *
   * The scheduled job is the normal path; this exists because a batch that
   * failed halfway — one courier's transfer erroring after three succeeded —
   * needs a way to be finished without waiting a week. Safe to re-run: the
   * per-courier idempotency key makes a repeat within the same day a no-op at
   * Stripe rather than a second payment.
   */
  @RequirePermission('payouts.run')
  @Post('run')
  run() {
    return this.payouts.runBatch();
  }
}

/** Where the app waits for the browser — see `ConnectReturnController`. */
const APP_RETURN_URL = 'sougouba://payouts-return';

/**
 * Where Stripe's hosted onboarding sends the browser back to.
 *
 * An HTTPS hop rather than handing Stripe the app's own scheme: Account Links
 * want a web URL, and this way the app does not depend on whether a custom
 * scheme is accepted. The app passes this route as both `returnUrl` and
 * `refreshUrl`; the in-app browser is waiting for `sougouba://payouts-return`
 * and closes the moment the redirect reaches it.
 *
 * Public on purpose — Stripe's redirect carries no token — and harmless for it:
 * the target is fixed, so this cannot be turned into an open redirect, and the
 * app re-reads the onboarding status from the API rather than trusting `state`.
 */
@ApiExcludeController()
@Controller('stripe/connect')
export class ConnectReturnController {
  @Get('return')
  @Redirect(APP_RETURN_URL, 302)
  back(@Query('state') state?: string) {
    // `refresh` means the link expired before it was finished; the app asks for a new one.
    return { url: `${APP_RETURN_URL}?state=${state === 'refresh' ? 'refresh' : 'done'}` };
  }
}
