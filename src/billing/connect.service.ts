import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierPayouts, couriers, merchantSubscriptions, vendors } from '../db/schema/index.js';
import { PaymentsService } from '../orders/payments.service.js';

/**
 * Stripe Connect onboarding, for merchants and couriers alike.
 *
 * **The reason both go through one service**: neither this database nor this
 * API ever holds a bank account number. The mobile app's courier signup collects
 * a transit and account number as plain validated strings
 * (`lib/validation/courier.ts`'s `courierPayoutSchema`), which the plan flags as
 * unencrypted PII with no verification behind it — and which `applyCourierSchema`
 * already refuses to accept. Stripe collects those details on its own hosted
 * onboarding page; what comes back here is an account id and a status.
 *
 * Every method needs a live Stripe key. Without one they surface the same
 * honest 503 `GeoService` and the webhook do, rather than pretending an account
 * was created.
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService
  ) {}

  // ── merchants ─────────────────────────────────────────────────────────────

  /**
   * Start (or resume) a merchant's Connect onboarding.
   *
   * Resumable on purpose: Stripe's onboarding is several screens of legal and
   * banking detail, and people abandon it halfway. The account id is stored on
   * first creation so a second call continues the same account rather than
   * opening a fresh one and stranding the first.
   */
  async onboardVendor(userId: string, returnUrl: string, refreshUrl: string) {
    const [vendor] = await this.db
      .select({ id: vendors.id, name: vendors.name, status: vendors.status })
      .from(vendors)
      .where(eq(vendors.ownerId, userId))
      .limit(1);
    if (!vendor) throw new NotFoundException('This account has no shop');
    // An unapproved shop cannot take money, so there is nothing for a Connect
    // account to receive — and creating one would leave a real Stripe account
    // attached to a file that may yet be rejected.
    if (vendor.status !== 'approved') {
      throw new ConflictException('Votre boutique doit être approuvée avant la configuration des paiements');
    }

    const [existing] = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.vendorId, vendor.id))
      .limit(1);

    const accountId =
      existing?.stripeConnectAccountId ??
      (await this.payments.createConnectAccount({ kind: 'vendor', id: vendor.id, name: vendor.name }));

    if (!existing) {
      // `status` is deliberately left at its `inactive` default. It tracks the
      // **subscription** — the 70 $/month — and a Connect account is a separate
      // thing: one is how the merchant gets paid, the other is what they pay.
      // A merchant can finish Connect onboarding and still owe a subscription,
      // and writing "onboarding" into this column would conflate two states
      // that come apart in practice.
      await this.db.insert(merchantSubscriptions).values({
        vendorId: vendor.id,
        stripeConnectAccountId: accountId,
      });
    } else if (!existing.stripeConnectAccountId) {
      await this.db
        .update(merchantSubscriptions)
        .set({ stripeConnectAccountId: accountId })
        .where(eq(merchantSubscriptions.vendorId, vendor.id));
    }

    const url = await this.payments.createAccountLink(accountId, returnUrl, refreshUrl);
    return { accountId, url };
  }

  /**
   * Whether Stripe will actually pay this merchant yet.
   *
   * Asked of Stripe rather than read from our own row: `charges_enabled` and
   * `payouts_enabled` flip when Stripe finishes its own verification, which
   * happens without telling us unless a webhook is wired. The stored status is
   * a cache for display; this is the truth.
   */
  async vendorStatus(userId: string) {
    const [vendor] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!vendor) throw new NotFoundException('This account has no shop');

    const [row] = await this.db
      .select()
      .from(merchantSubscriptions)
      .where(eq(merchantSubscriptions.vendorId, vendor.id))
      .limit(1);
    if (!row?.stripeConnectAccountId) {
      return { onboarded: false, chargesEnabled: false, payoutsEnabled: false, status: 'not_started' as const };
    }

    const live = await this.payments.getConnectAccount(row.stripeConnectAccountId);
    return {
      onboarded: live.detailsSubmitted,
      chargesEnabled: live.chargesEnabled,
      payoutsEnabled: live.payoutsEnabled,
      status: row.status,
      accountId: row.stripeConnectAccountId,
    };
  }

  // ── couriers ──────────────────────────────────────────────────────────────

  /** The courier half, same shape — and the reason no bank detail is stored here. */
  async onboardCourier(userId: string, returnUrl: string, refreshUrl: string) {
    const [courier] = await this.db
      .select({ id: couriers.id, fullName: couriers.fullName, status: couriers.status })
      .from(couriers)
      .where(eq(couriers.userId, userId))
      .limit(1);
    if (!courier) throw new NotFoundException('This account has no courier file');
    if (courier.status !== 'approved') {
      throw new ConflictException('Votre dossier doit être approuvé avant la configuration des paiements');
    }

    const [existing] = await this.db
      .select()
      .from(courierPayouts)
      .where(eq(courierPayouts.courierId, courier.id))
      .limit(1);

    const accountId =
      existing?.stripeConnectAccountId ??
      (await this.payments.createConnectAccount({ kind: 'courier', id: courier.id, name: courier.fullName }));

    if (!existing) {
      await this.db.insert(courierPayouts).values({
        courierId: courier.id,
        stripeConnectAccountId: accountId,
        status: 'onboarding',
      });
    } else if (!existing.stripeConnectAccountId) {
      await this.db
        .update(courierPayouts)
        .set({ stripeConnectAccountId: accountId, updatedAt: new Date() })
        .where(eq(courierPayouts.courierId, courier.id));
    }

    const url = await this.payments.createAccountLink(accountId, returnUrl, refreshUrl);
    return { accountId, url };
  }

  async courierStatus(userId: string) {
    const [courier] = await this.db.select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId)).limit(1);
    if (!courier) throw new NotFoundException('This account has no courier file');

    const [row] = await this.db.select().from(courierPayouts).where(eq(courierPayouts.courierId, courier.id)).limit(1);
    if (!row?.stripeConnectAccountId) {
      return { onboarded: false, chargesEnabled: false, payoutsEnabled: false, status: 'not_started' as const };
    }

    const live = await this.payments.getConnectAccount(row.stripeConnectAccountId);
    return {
      onboarded: live.detailsSubmitted,
      chargesEnabled: live.chargesEnabled,
      payoutsEnabled: live.payoutsEnabled,
      status: row.status,
      accountId: row.stripeConnectAccountId,
    };
  }
}
