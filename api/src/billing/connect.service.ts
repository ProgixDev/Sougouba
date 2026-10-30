import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
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

  /**
   * The account's sign-in email. Stripe refuses a recipient account without a
   * contact email, and it is the address Stripe writes to about the payouts.
   */
  private async emailOf(userId: string): Promise<string> {
    const { data } = await this.db.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) throw new ConflictException('Ajoutez une adresse courriel à votre compte pour configurer les versements');
    return email;
  }

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
    const vendor = await unwrap<{ id: string; name: string; status: string } | null>(
      this.db.from('vendors').select('id, name, status').eq('owner_id', userId).maybeSingle()
    );
    if (!vendor) throw new NotFoundException('This account has no shop');
    // An unapproved shop cannot take money, so there is nothing for a Connect
    // account to receive — and creating one would leave a real Stripe account
    // attached to a file that may yet be rejected.
    if (vendor.status !== 'approved') {
      throw new ConflictException('Votre boutique doit être approuvée avant la configuration des paiements');
    }

    const existing = await unwrap<{ stripe_connect_account_id: string | null } | null>(
      this.db.from('merchant_subscriptions').select('*').eq('vendor_id', vendor.id).maybeSingle()
    );

    const accountId =
      existing?.stripe_connect_account_id ??
      (await this.payments.createConnectAccount({
        kind: 'vendor',
        id: vendor.id,
        name: vendor.name,
        email: await this.emailOf(userId),
      }));

    if (!existing) {
      // `status` is deliberately left at its `inactive` default. It tracks the
      // **subscription** — the 70 $/month — and a Connect account is a separate
      // thing: one is how the merchant gets paid, the other is what they pay.
      // A merchant can finish Connect onboarding and still owe a subscription,
      // and writing "onboarding" into this column would conflate two states
      // that come apart in practice.
      await unwrap(
        this.db.from('merchant_subscriptions').insert({
          vendor_id: vendor.id,
          stripe_connect_account_id: accountId,
        })
      );
    } else if (!existing.stripe_connect_account_id) {
      await unwrap(
        this.db
          .from('merchant_subscriptions')
          .update({ stripe_connect_account_id: accountId })
          .eq('vendor_id', vendor.id)
      );
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
    const vendor = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (!vendor) throw new NotFoundException('This account has no shop');

    const row = await unwrap<{ stripe_connect_account_id: string | null; status: string } | null>(
      this.db.from('merchant_subscriptions').select('*').eq('vendor_id', vendor.id).maybeSingle()
    );
    if (!row?.stripe_connect_account_id) {
      return { onboarded: false, chargesEnabled: false, payoutsEnabled: false, status: 'not_started' as const };
    }

    const live = await this.payments.getConnectAccount(row.stripe_connect_account_id);
    return {
      onboarded: live.detailsSubmitted,
      chargesEnabled: live.chargesEnabled,
      payoutsEnabled: live.payoutsEnabled,
      status: row.status,
      accountId: row.stripe_connect_account_id,
    };
  }

  // ── couriers ──────────────────────────────────────────────────────────────

  /** The courier half, same shape — and the reason no bank detail is stored here. */
  async onboardCourier(userId: string, returnUrl: string, refreshUrl: string) {
    const courier = await unwrap<{ id: string; fullName: string; status: string } | null>(
      this.db.from('couriers').select('id, fullName:full_name, status').eq('user_id', userId).maybeSingle()
    );
    if (!courier) throw new NotFoundException('This account has no courier file');
    if (courier.status !== 'approved') {
      throw new ConflictException('Votre dossier doit être approuvé avant la configuration des paiements');
    }

    const existing = await unwrap<{ stripe_connect_account_id: string | null } | null>(
      this.db.from('courier_payouts').select('*').eq('courier_id', courier.id).maybeSingle()
    );

    const accountId =
      existing?.stripe_connect_account_id ??
      (await this.payments.createConnectAccount({
        kind: 'courier',
        id: courier.id,
        name: courier.fullName,
        email: await this.emailOf(userId),
      }));

    if (!existing) {
      await unwrap(
        this.db.from('courier_payouts').insert({
          courier_id: courier.id,
          stripe_connect_account_id: accountId,
          status: 'onboarding',
        })
      );
    } else if (!existing.stripe_connect_account_id) {
      await unwrap(
        this.db
          .from('courier_payouts')
          .update({ stripe_connect_account_id: accountId, updated_at: new Date().toISOString() })
          .eq('courier_id', courier.id)
      );
    }

    const url = await this.payments.createAccountLink(accountId, returnUrl, refreshUrl);
    return { accountId, url };
  }

  async courierStatus(userId: string) {
    const courier = await unwrap<{ id: string } | null>(
      this.db.from('couriers').select('id').eq('user_id', userId).maybeSingle()
    );
    if (!courier) throw new NotFoundException('This account has no courier file');

    const row = await unwrap<{ stripe_connect_account_id: string | null; status: string } | null>(
      this.db.from('courier_payouts').select('*').eq('courier_id', courier.id).maybeSingle()
    );
    if (!row?.stripe_connect_account_id) {
      return { onboarded: false, chargesEnabled: false, payoutsEnabled: false, status: 'not_started' as const };
    }

    const live = await this.payments.getConnectAccount(row.stripe_connect_account_id);
    return {
      onboarded: live.detailsSubmitted,
      chargesEnabled: live.chargesEnabled,
      payoutsEnabled: live.payoutsEnabled,
      status: row.status,
      accountId: row.stripe_connect_account_id,
    };
  }
}
