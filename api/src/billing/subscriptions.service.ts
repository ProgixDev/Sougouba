import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';

import type { Db, Tables } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapVoid } from '../db/unwrap.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { NotifyService } from '../notifications/notify.service.js';
import { PaymentsService, type BillingSubscription } from '../orders/payments.service.js';

export type SubscriptionStatus = Tables<'merchant_subscriptions'>['status'];

/** What the merchant's screens, and the back office, are told about a shop's subscription. */
export interface MerchantSubscription {
  status: SubscriptionStatus;
  /** What this shop pays each month once subscribed — or, before that, what subscribing costs today. */
  priceCad: number;
  /** When the month already paid for ends: the next charge, or the last day of a cancelled subscription. */
  currentPeriodEnd: string | null;
  /** Set once the merchant has cancelled; the subscription runs until then. */
  cancelAt: string | null;
  /** False when this deploy cannot reach Stripe: there is nothing to subscribe with. */
  available: boolean;
}

type Row = Pick<
  Tables<'merchant_subscriptions'>,
  'vendor_id' | 'status' | 'stripe_customer_id' | 'stripe_subscription_id' | 'current_period_end' | 'cancel_at' | 'price_cad'
>;

/**
 * `*` rather than the column list above, on purpose: against a database that
 * `0052` has not reached, naming `cancel_at` would fail the read and take the
 * merchant's profile screen with it. This way the shop just reads as not subscribed.
 */
const ROW = '*';

/**
 * Stripe's eight subscription states, as the four this app tells a merchant.
 *
 * `trialing` is paid-up as far as the shop is concerned. `unpaid` is where
 * `past_due` ends up once Stripe stops retrying — still "a payment is owed",
 * not "never subscribed". `incomplete` is a checkout whose first payment has
 * not gone through: nothing was bought yet.
 */
export function localStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'inactive';
  }
}

/**
 * The merchant's monthly subscription (CDC addendum v1.1, §05): 70 $/month,
 * owed on top of the 12 % commission — the two are cumulative, not a choice.
 *
 * **Stripe Billing does the billing.** It charges the card each month, retries
 * a failed payment, emails the invoice and the receipt. This service starts
 * the subscription (Stripe's hosted checkout), hands the merchant to Stripe's
 * portal to manage it, and keeps a copy of where it stands.
 *
 * **The copy is refreshed from Stripe, never computed.** Both a webhook and the
 * merchant opening their screen end in `sync`, which asks Stripe for the
 * customer's subscription and writes what it says. So an event that arrives
 * late, twice or out of order cannot leave the copy wrong — it only causes one
 * more read of the truth.
 *
 * ⚠️ **Nothing here stops a shop from selling.** A shop that never subscribes,
 * or whose card fails, keeps taking orders; its standing is shown to the
 * merchant and to the back office and that is all. Whether an unpaid
 * subscription should suspend a shop, and after how long, is the client's
 * decision and has not been made — the plan doc has carried it as an open
 * question since Phase 7 was written.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService
  ) {}

  // ── the merchant ──────────────────────────────────────────────────────────

  /** Where the caller's shop stands, re-read from Stripe when it has ever started a subscription. */
  async statusFor(userId: string): Promise<MerchantSubscription> {
    const vendor = await this.vendorOf(userId);
    return this.view(vendor.id);
  }

  /**
   * A link to Stripe's hosted checkout, where the merchant enters a card and
   * the subscription starts.
   *
   * Refused for a shop that is not approved — it cannot sell yet, so there is
   * nothing to bill for — and for one already subscribed, which would otherwise
   * be charged twice a month.
   */
  async startCheckout(userId: string, urls: { successUrl: string; cancelUrl: string }): Promise<{ url: string }> {
    this.assertConfigured();
    const vendor = await this.vendorOf(userId);
    if (vendor.status !== 'approved') {
      throw new ConflictException('Votre boutique doit être approuvée avant de souscrire l’abonnement');
    }

    const { monthlySubscriptionCad } = await this.settings.all();
    if (!(monthlySubscriptionCad > 0)) {
      throw new ConflictException('Aucun abonnement n’est exigé pour le moment');
    }

    const customerId = await this.customerFor(vendor, userId);
    const current = await this.sync(customerId);
    if (current && (current.status === 'active' || current.status === 'past_due')) {
      throw new ConflictException('Votre boutique est déjà abonnée. Gérez l’abonnement plutôt que d’en ouvrir un second.');
    }

    const priceId = await this.payments.subscriptionPrice(monthlySubscriptionCad);
    const url = await this.payments.createSubscriptionCheckout({ customerId, priceId, vendorId: vendor.id, ...urls });
    return { url };
  }

  /** A link to Stripe's portal: change the card, read the invoices, cancel. */
  async openPortal(userId: string, returnUrl: string): Promise<{ url: string }> {
    this.assertConfigured();
    const vendor = await this.vendorOf(userId);
    const row = await this.row(vendor.id);
    if (!row?.stripe_customer_id) {
      throw new ConflictException('Aucun abonnement à gérer : souscrivez-le d’abord');
    }
    return { url: await this.payments.createBillingPortal(row.stripe_customer_id, returnUrl) };
  }

  // ── Stripe's callbacks ────────────────────────────────────────────────────

  /**
   * Something happened to a Stripe customer — a subscription started, renewed,
   * failed to renew, was cancelled. Whatever it was, the answer is the same:
   * read where their subscription stands now and write it down.
   *
   * A customer id this database has never stored is not an error. Shoppers pay
   * through Stripe too, and an event about one of them simply is not ours.
   */
  async onCustomerEvent(customerId: string): Promise<void> {
    const row = await unwrap<Row | null>(
      this.db.from('merchant_subscriptions').select(ROW).eq('stripe_customer_id', customerId).maybeSingle()
    );
    if (!row) return;

    const before = row.status;
    const after = await this.sync(customerId);
    // Told once, as the subscription *becomes* overdue — not again on each of
    // Stripe's retries, which arrive as further events with the same standing.
    if (after?.status === 'past_due' && before !== 'past_due') {
      await this.notify.subscriptionPaymentFailed(row.vendor_id);
    }
  }

  /**
   * The shop's account is being deleted: stop charging its card.
   *
   * Never throws. An account deletion that failed because Stripe was briefly
   * unreachable would leave the person unable to leave; a subscription left
   * running is recoverable by hand, and the log line says exactly which one.
   */
  async cancelForVendor(vendorId: string): Promise<void> {
    const row = await this.row(vendorId).catch(() => null);
    if (!row?.stripe_subscription_id || row.status === 'canceled' || row.status === 'inactive') return;
    try {
      await this.payments.cancelSubscription(row.stripe_subscription_id);
      await unwrapVoid(
        this.db
          .from('merchant_subscriptions')
          .update({ status: 'canceled', cancel_at: null, updated_at: new Date().toISOString() })
          .eq('vendor_id', vendorId)
      );
    } catch (error) {
      this.logger.error(
        `Vendor ${vendorId} was deleted but its subscription ${row.stripe_subscription_id} could NOT be cancelled: ${String(error)}. CANCEL IT IN STRIPE BY HAND.`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  private assertConfigured(): void {
    if (!this.payments.isConfigured) {
      throw new ServiceUnavailableException('Stripe n’est pas configuré sur ce serveur : l’abonnement est indisponible');
    }
  }

  private async vendorOf(userId: string): Promise<{ id: string; name: string; status: string }> {
    const vendor = await unwrap<{ id: string; name: string; status: string } | null>(
      this.db.from('vendors').select('id, name, status').eq('owner_id', userId).maybeSingle()
    );
    if (!vendor) throw new NotFoundException('This account has no shop');
    return vendor;
  }

  private row(vendorId: string): Promise<Row | null> {
    return unwrap<Row | null>(this.db.from('merchant_subscriptions').select(ROW).eq('vendor_id', vendorId).maybeSingle());
  }

  /** The shop's standing: Stripe's answer if it can be had, the recorded one if not. */
  private async view(vendorId: string): Promise<MerchantSubscription> {
    const [row, { monthlySubscriptionCad }] = await Promise.all([this.row(vendorId), this.settings.all()]);
    if (!row?.stripe_customer_id || !this.payments.isConfigured) return this.toView(row, monthlySubscriptionCad);

    // A screen that fails because Stripe hiccupped is worse than one that shows
    // what was true a moment ago.
    await this.sync(row.stripe_customer_id).catch((error: unknown) => {
      this.logger.warn(`Subscription of vendor ${vendorId} not refreshed from Stripe: ${String(error)}`);
    });
    return this.toView(await this.row(vendorId), monthlySubscriptionCad);
  }

  private toView(row: Row | null, monthlySubscriptionCad: number): MerchantSubscription {
    const subscribed = row !== null && row.status !== 'inactive';
    return {
      status: row?.status ?? 'inactive',
      // A subscribed shop is shown the price it is actually billed, which may
      // be an older one than today's setting.
      priceCad: subscribed && row.price_cad != null ? Number(row.price_cad) : monthlySubscriptionCad,
      currentPeriodEnd: subscribed ? row.current_period_end : null,
      cancelAt: subscribed ? (row.cancel_at ?? null) : null,
      available: this.payments.isConfigured,
    };
  }

  /**
   * The shop's Stripe customer, created the first time it is needed.
   *
   * `ConnectService` may already have made this shop's row (it keeps the
   * Connect account in the same table), so the customer id is *added* to a row
   * that exists and a row is made when none does. The `is null` guard is what
   * keeps a double tap from replacing one customer with another.
   */
  private async customerFor(vendor: { id: string; name: string }, userId: string): Promise<string> {
    const existing = await this.row(vendor.id);
    if (existing?.stripe_customer_id) return existing.stripe_customer_id;

    const { data } = await this.db.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) throw new ConflictException('Ajoutez une adresse courriel à votre compte pour souscrire l’abonnement');

    const customerId = await this.payments.createBillingCustomer({ vendorId: vendor.id, name: vendor.name, email });

    if (existing) {
      await unwrapVoid(
        this.db
          .from('merchant_subscriptions')
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq('vendor_id', vendor.id)
          .is('stripe_customer_id', null)
      );
    } else {
      // Ignored on conflict: a concurrent call made the row first.
      await this.db.from('merchant_subscriptions').insert({ vendor_id: vendor.id, stripe_customer_id: customerId });
    }

    // Whichever write won is the customer this shop has.
    const stored = await this.row(vendor.id);
    return stored?.stripe_customer_id ?? customerId;
  }

  /** Ask Stripe where the customer's subscription stands, and record it. Returns what was recorded. */
  private async sync(customerId: string): Promise<{ status: SubscriptionStatus } | null> {
    const live: BillingSubscription | null = await this.payments.subscriptionOf(customerId);
    const status = live ? localStatus(live.status) : 'inactive';

    await unwrapVoid(
      this.db
        .from('merchant_subscriptions')
        .update({
          status,
          stripe_subscription_id: live?.id ?? null,
          current_period_end: live?.currentPeriodEnd ?? null,
          cancel_at: live?.cancelAt ?? null,
          price_cad: live?.priceCad ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId)
    );
    return live ? { status } : null;
  }
}
