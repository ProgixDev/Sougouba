import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import type { Env } from '../config/env.js';

/**
 * Stripe, and the one rule that matters: **the client never tells this API that
 * a payment succeeded.** It hands over a PaymentIntent id; the API asks Stripe.
 *
 * Everything else here follows from that. The intent is created server-side for
 * a server-computed amount, so there is no number the client could have chosen;
 * it is re-fetched at order time and checked for status, amount, currency and
 * owner, so a succeeded intent for 1 $ cannot buy a 100 $ basket, and one
 * belonging to another shopper cannot be replayed at all.
 *
 * Unconfigured behaviour matches `GeoService`'s: a clear 503 naming the missing
 * variable, never a silent success. An API that pretends to take payments is
 * worse than one that admits it cannot.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService<Env, true>) {
    const key = this.config.get('STRIPE_SECRET_KEY', { infer: true });
    // Constructed once: the SDK holds a connection pool, and building one per
    // request is the standard way to make Stripe calls slow for no reason.
    this.stripe = key ? new Stripe(key) : null;
  }

  get isConfigured(): boolean {
    return this.stripe !== null;
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Payments are not configured — STRIPE_SECRET_KEY is unset (see docs/BACKEND-BUILD-PHASES.md, Phase 3).'
      );
    }
    return this.stripe;
  }

  /**
   * Create the intent the app's payment sheet confirms.
   *
   * `amountCents` is the server's own total. The order is *not* created here —
   * an intent may be abandoned, may fail, may sit unconfirmed forever, and a
   * row written now would be an order nobody paid for. The order is written
   * once, later, against a succeeded intent.
   *
   * `customerId` goes into metadata so `assertPaidBy` can refuse a valid intent
   * belonging to somebody else. Metadata is the right home for it: it is
   * returned on every retrieve, it is visible in the Stripe dashboard when
   * someone is reconciling a payment by hand, and it costs no extra call.
   */
  async createIntent(input: {
    amountCents: number;
    customerId: string;
    vendorId: string;
    /**
     * Phase 7's commission split. When the merchant has finished Connect
     * onboarding, the payment is a **destination charge**: Stripe moves the
     * whole amount, keeps `applicationFeeCents` on the platform's balance and
     * settles the rest to the merchant automatically.
     *
     * Omitted when they have not onboarded — the money then sits on the
     * platform balance and is settled manually. Charging a fee toward an
     * account that cannot receive it would fail the whole payment, which would
     * mean an approved shop could not sell until its banking was finished.
     */
    split?: { connectAccountId: string; applicationFeeCents: number };
  }): Promise<{ paymentIntentId: string; clientSecret: string; amountCents: number }> {
    const intent = await this.client().paymentIntents.create({
      amount: input.amountCents,
      currency: 'cad',
      // Apple Pay and Google Pay ride on the card rail and need no separate
      // method here — the devis lists all three, and this covers all three.
      automatic_payment_methods: { enabled: true },
      metadata: { customerId: input.customerId, vendorId: input.vendorId },
      ...(input.split
        ? {
            application_fee_amount: input.split.applicationFeeCents,
            transfer_data: { destination: input.split.connectAccountId },
          }
        : {}),
    });

    if (!intent.client_secret) {
      // Should not happen on a freshly created intent, but a null here would
      // otherwise reach the app as a payment sheet that cannot open.
      throw new ServiceUnavailableException('Stripe returned an intent with no client secret');
    }

    return { paymentIntentId: intent.id, clientSecret: intent.client_secret, amountCents: intent.amount };
  }

  /**
   * The gate `POST /orders` passes before it writes anything.
   *
   * Four checks, each closing a different hole:
   * - **status** — anything but `succeeded` means the money did not move.
   *   `requires_capture` is deliberately refused too: an authorised-but-uncaptured
   *   payment can still fail at capture, and an order created on one would be
   *   food dispatched against a payment that never completed.
   * - **amount** — the intent was created for the server's total, but a client
   *   could hand back the id of a *different*, cheaper intent it also owns.
   *   Re-checking against the freshly recomputed total is what makes that
   *   pointless.
   * - **currency** — a CAD total settled in a weaker currency would clear every
   *   numeric check while paying a fraction of the price.
   * - **owner** — an intent id is not a secret between users; without this,
   *   one shopper's paid intent could be replayed by another.
   */
  async assertPaidBy(
    paymentIntentId: string,
    expected: { amountCents: number; customerId: string }
  ): Promise<{ split: boolean; applicationFeeCents: number }> {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.client().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    } catch (error) {
      // Never echo Stripe's message back — it distinguishes "no such intent"
      // from "belongs to another account", which is an id-probing oracle.
      this.logger.warn(`PaymentIntent ${paymentIntentId} could not be retrieved: ${String(error)}`);
      throw new BadRequestException('Payment could not be verified');
    }

    if (intent.status !== 'succeeded') {
      throw new BadRequestException(`Payment has not completed (status: ${intent.status})`);
    }
    if (intent.amount_received !== expected.amountCents) {
      this.logger.warn(
        `PaymentIntent ${paymentIntentId} paid ${intent.amount_received} but the order prices at ${expected.amountCents}`
      );
      throw new BadRequestException('Payment amount does not match the order total');
    }
    if (intent.currency !== 'cad') {
      throw new BadRequestException(`Payment is in ${intent.currency}, not CAD`);
    }
    if (intent.metadata?.customerId !== expected.customerId) {
      this.logger.warn(`PaymentIntent ${paymentIntentId} belongs to another customer`);
      throw new BadRequestException('Payment could not be verified');
    }
    // A refunded payment still reads `succeeded` with its full `amount_received`.
    // Without this, a checkout that was refunded by `refundUnplacedOrder` could
    // be retried into an order nobody paid for.
    const charge = intent.latest_charge;
    if (charge && typeof charge !== 'string' && charge.amount_refunded > 0) {
      throw new BadRequestException('This payment has been refunded');
    }

    // How the money was divided, for the order's own record (and, months later,
    // the shop's statement). Read off the intent that was actually paid rather
    // than recomputed: whether a payment was split depended on the shop having
    // a Stripe account at that moment, which nothing else remembers.
    return {
      split: Boolean(intent.transfer_data?.destination),
      applicationFeeCents: intent.application_fee_amount ?? 0,
    };
  }

  /**
   * Give the money back for a payment that never became an order.
   *
   * The payment sheet charges first and the order is written after — so a
   * failure in between (an item sold out, a coupon used up, a price that moved,
   * the database unreachable) leaves a shopper charged for nothing. This is the
   * other half of that sequence.
   *
   * Refunds only what is provably this shopper's own completed, unrefunded
   * payment — never on the strength of an id alone, which would let anyone
   * refund someone else's order. The idempotency key makes a repeated call a
   * no-op at Stripe rather than a second refund. Never throws: the caller is
   * already on an error path and must surface *that* error.
   */
  async refundUnplacedOrder(paymentIntentId: string, customerId: string): Promise<void> {
    try {
      const intent = await this.client().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
      const charge = intent.latest_charge;
      const alreadyRefunded = charge && typeof charge !== 'string' && charge.amount_refunded > 0;
      if (intent.status !== 'succeeded' || intent.metadata?.customerId !== customerId || alreadyRefunded) return;
      const refund = await this.client().refunds.create(
        { payment_intent: paymentIntentId, reason: 'requested_by_customer' },
        { idempotencyKey: `unplaced-order-${paymentIntentId}` }
      );
      this.logger.warn(`Order not written after payment ${paymentIntentId} — refunded in full (${refund.id}).`);
    } catch (error) {
      this.logger.error(`Order not written after payment ${paymentIntentId} and the refund FAILED: ${String(error)}. REFUND BY HAND.`);
    }
  }

  /**
   * How a payment was made — the card network, its last four digits, and the
   * wallet it came through — for the receipt's "Paiement" line.
   *
   * Read back from Stripe rather than stored at checkout: the card never
   * touches this API, and a receipt asks for this rarely enough that one
   * retrieve is cheaper than a column to keep in step.
   *
   * Never throws, and null is a normal answer — Stripe unconfigured, a seeded
   * order with no intent, a network blip. A receipt without its payment line is
   * still a receipt; a receipt that fails to render is not.
   */
  async describePayment(
    paymentIntentId: string | null
  ): Promise<{ brand: string | null; last4: string | null; wallet: string | null } | null> {
    if (!paymentIntentId || !this.stripe) return null;
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
      const charge = intent.latest_charge;
      if (!charge || typeof charge === 'string') return null;
      const card = charge.payment_method_details?.card;
      if (!card) return null;
      return { brand: card.brand ?? null, last4: card.last4 ?? null, wallet: card.wallet?.type ?? null };
    } catch (error) {
      this.logger.warn(`Payment method of ${paymentIntentId} could not be read: ${String(error)}`);
      return null;
    }
  }

  // ── Connect (Phase 7) ─────────────────────────────────────────────────────

  /**
   * Create a connected account for a merchant or a courier.
   *
   * **Accounts v2** (`/v2/core/accounts`): Stripe refuses v1
   * `accounts.create({ type: 'express' })` for new Connect integrations, which
   * is the 500 couriers hit on "Configurer mes versements".
   *
   * Configured as a marketplace *recipient*: the platform takes the payment
   * and the account receives transfers (a merchant's share, a courier's week),
   * so only `stripe_transfers` is requested — no `merchant` configuration, which
   * would add card-payment onboarding nobody here needs. Express dashboard and
   * the platform collecting fees and owning losses, per Stripe's marketplace
   * defaults. Stripe hosts the onboarding and holds the bank details; this API
   * never sees them.
   */
  async createConnectAccount(subject: {
    kind: 'vendor' | 'courier';
    id: string;
    name: string;
    /** Required by Stripe on any account with the `recipient` configuration. */
    email: string;
  }): Promise<string> {
    const account = await this.client().v2.core.accounts.create({
      display_name: subject.name,
      contact_email: subject.email,
      dashboard: 'express',
      identity: {
        country: 'ca',
        entity_type: subject.kind === 'courier' ? 'individual' : 'company',
      },
      defaults: {
        currency: 'cad',
        locales: ['fr-CA'],
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      metadata: { sougoubaKind: subject.kind, sougoubaId: subject.id },
    });
    this.logger.log(`Created Connect account ${account.id} for ${subject.kind} ${subject.id}`);
    return account.id;
  }

  /**
   * A one-time onboarding URL.
   *
   * Short-lived by Stripe's design, which is why this is generated per request
   * rather than stored: a saved link is a link that has expired by the time
   * someone clicks it. Onboarding an account that already finished it reopens
   * the same form for review, which is what "Revoir mes informations" wants.
   */
  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
    const link = await this.client().v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          return_url: returnUrl,
          refresh_url: refreshUrl,
        },
      },
    });
    return link.url;
  }

  /**
   * What Stripe currently believes about an account — the truth behind our cached status.
   *
   * Read from the v2 transfer capability, not v1's `payouts_enabled`:
   * `active` means a transfer will land. Short of that, the status details say
   * whether Stripe is still checking what was submitted (`onboarded`, waiting)
   * or is missing something the courier has to fill in.
   */
  async getConnectAccount(accountId: string) {
    const account = await this.client().v2.core.accounts.retrieve(accountId, {
      include: ['configuration.recipient', 'requirements'],
    });
    const transfers = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
    const active = transfers?.status === 'active';
    const verifying = (transfers?.status_details ?? []).some(
      (d) => d.code === 'requirements_pending_verification' || d.code === 'determining_status'
    );
    const outstanding = (account.requirements?.entries ?? []).length;
    return {
      detailsSubmitted: active || verifying || (transfers !== undefined && outstanding === 0),
      // Recipient accounts never take card payments themselves; kept so the
      // status payload keeps its shape for the clients that read it.
      chargesEnabled: active,
      payoutsEnabled: active,
    };
  }

  /**
   * Pay a courier, or settle a merchant's balance.
   *
   * A `Transfer` rather than a `Payout`: the money moves from the platform's
   * Stripe balance to the connected account, and Stripe then pays it out to
   * their bank on its own schedule. Doing it the other way round would mean the
   * platform holding and disbursing funds itself.
   *
   * `idempotencyKey` is not optional in practice — a payout job that retries
   * without one pays twice, and this is the one call in the codebase where that
   * is real money leaving.
   */
  async transfer(input: {
    accountId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
    /**
     * A name the transfer can be found by later (`findTransfer`). An
     * idempotency key only protects a retry for a day; a payout left open
     * longer than that needs to be able to ask "did this go?" another way.
     */
    transferGroup?: string;
  }): Promise<string> {
    const transfer = await this.client().transfers.create(
      {
        amount: input.amountCents,
        currency: 'cad',
        destination: input.accountId,
        description: input.description,
        ...(input.transferGroup ? { transfer_group: input.transferGroup } : {}),
      },
      { idempotencyKey: input.idempotencyKey }
    );
    this.logger.log(`Transferred ${input.amountCents} to ${input.accountId} → ${transfer.id}`);
    return transfer.id;
  }

  /**
   * The transfer made under this group, if one was — how a payout that was
   * claimed but never marked paid finds out whether its money already left.
   * Throws when Stripe cannot be asked: "unknown" must not be read as "no".
   */
  async findTransfer(transferGroup: string): Promise<string | null> {
    const { data } = await this.client().transfers.list({ transfer_group: transferGroup, limit: 1 });
    return data[0]?.id ?? null;
  }

  /**
   * Send money back. Returns Stripe's refund id.
   *
   * Deliberately not swallowing failures: the caller writes the order's refund
   * record only once this resolves, so a throw here leaves the order unrefunded
   * — which is the honest state — rather than marked refunded against a payment
   * Stripe declined to reverse.
   *
   * A `charge_already_refunded` from Stripe surfaces as a plain error too. That
   * means the database and Stripe disagree, which is worth a human looking at
   * rather than a silent success.
   */
  async refund(paymentIntentId: string, amountCents: number): Promise<string> {
    const refund = await this.client().refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      // Stripe's own reason vocabulary is three fixed values and none of them
      // fit "an administrator upheld a dispute". The real reason is stored on
      // the order; this keeps the Stripe dashboard honest about who asked.
      reason: 'requested_by_customer',
    });
    this.logger.log(`Refunded ${amountCents} on ${paymentIntentId} → ${refund.id} (${refund.status})`);
    return refund.id;
  }

  /**
   * Give back the whole payment of an order that was cancelled before it was
   * delivered. Returns Stripe's refund id; throws like `refund` does.
   *
   * Two things a refund after delivery does not need:
   *
   * - **`unwind`**, for a payment that was split with the shop. Nothing was
   *   sold, so the shop's share comes back from its Stripe account
   *   (`reverse_transfer`) and Sougouba gives up its commission
   *   (`refund_application_fee`) — otherwise the platform would refund the
   *   shopper out of its own balance while the shop kept the money for an order
   *   it never handed over.
   * - **an idempotency key** on the order. A cancellation is retried by
   *   whoever notices it did not finish; the key makes the second call return
   *   the first refund instead of sending the money twice.
   */
  async refundCancelledOrder(
    paymentIntentId: string,
    amountCents: number,
    opts: { orderId: string; unwind: boolean }
  ): Promise<string> {
    const refund = await this.client().refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amountCents,
        reason: 'requested_by_customer',
        ...(opts.unwind ? { reverse_transfer: true, refund_application_fee: true } : {}),
      },
      { idempotencyKey: `order-cancel-${opts.orderId}` }
    );
    this.logger.log(`Cancelled order ${opts.orderId}: refunded ${amountCents} on ${paymentIntentId} → ${refund.id} (${refund.status})`);
    return refund.id;
  }

  // ── Billing: the merchant's monthly subscription ──────────────────────────

  /**
   * The Stripe Price a new subscription is created on, for the platform's
   * current monthly fee.
   *
   * Stripe prices are immutable, and the fee is an admin setting that can move.
   * So the price is looked up by a key that *contains the amount*: changing the
   * fee from 70 $ to 80 $ makes the next subscriber land on a new price, while
   * every shop already subscribed stays on the one it agreed to — moving them
   * is a decision, not a side effect of saving a settings form.
   *
   * One Product, by a fixed id, so the dashboard shows one line for "the
   * Sougouba subscription" however many prices it has had.
   */
  async subscriptionPrice(amountCad: number): Promise<string> {
    const stripe = this.client();
    const lookupKey = subscriptionPriceKey(amountCad);

    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (existing.data[0]) return existing.data[0].id;

    try {
      await stripe.products.retrieve(SUBSCRIPTION_PRODUCT_ID);
    } catch {
      await stripe.products.create({
        id: SUBSCRIPTION_PRODUCT_ID,
        name: 'Abonnement Sougouba',
        description: 'Abonnement mensuel du commerce sur la plateforme Sougouba.',
      });
    }

    const price = await stripe.prices.create({
      product: SUBSCRIPTION_PRODUCT_ID,
      currency: 'cad',
      unit_amount: Math.round(amountCad * 100),
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
    });
    this.logger.log(`Created subscription price ${price.id} (${lookupKey})`);
    return price.id;
  }

  /** The Stripe customer a shop's subscription, invoices and card hang off. */
  async createBillingCustomer(shop: { vendorId: string; name: string; email: string }): Promise<string> {
    const customer = await this.client().customers.create({
      name: shop.name,
      email: shop.email,
      preferred_locales: ['fr-CA'],
      // For a human reading the dashboard. Webhooks are matched on the customer
      // id stored in `merchant_subscriptions`, never on this.
      metadata: { sougoubaVendorId: shop.vendorId },
    });
    this.logger.log(`Created billing customer ${customer.id} for vendor ${shop.vendorId}`);
    return customer.id;
  }

  /**
   * Stripe's hosted page where the merchant enters a card and starts the
   * subscription. Hosted, so the card never touches this API or the app.
   *
   * No `payment_method_types`: Stripe offers whatever the dashboard enables.
   */
  async createSubscriptionCheckout(input: {
    customerId: string;
    priceId: string;
    vendorId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.client().checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.vendorId,
      locale: 'fr-CA',
      integration_identifier: 'sougouba_merchant_subscription_kqzvmxha',
      subscription_data: { description: 'Abonnement mensuel Sougouba' },
    });
    if (!session.url) throw new ServiceUnavailableException('Stripe returned a checkout session with no URL');
    return session.url;
  }

  /**
   * Stripe's hosted page where a subscribed merchant changes their card, reads
   * their invoices or cancels. The portal needs a configuration saying which of
   * those it offers; one is created the first time and reused after.
   */
  async createBillingPortal(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.client().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      configuration: await this.portalConfiguration(),
      locale: 'fr-CA',
    });
    return session.url;
  }

  private portalConfigurationId: string | null = null;

  private async portalConfiguration(): Promise<string> {
    if (this.portalConfigurationId) return this.portalConfigurationId;
    const stripe = this.client();
    const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
    const ours = existing.data.find((c) => c.metadata?.sougouba === PORTAL_TAG);
    const configuration =
      ours ??
      (await stripe.billingPortal.configurations.create({
        business_profile: { headline: 'Votre abonnement Sougouba' },
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address', 'tax_id'] },
          // At the end of the month already paid for, not at once: the merchant
          // keeps what they bought, and nobody has to compute a partial refund.
          subscription_cancel: { enabled: true, mode: 'at_period_end' },
        },
        metadata: { sougouba: PORTAL_TAG },
      }));
    this.portalConfigurationId = configuration.id;
    return configuration.id;
  }

  /**
   * Where a customer's subscription stands right now, read from Stripe.
   *
   * A customer can accumulate several over time — cancelled, then subscribed
   * again — so the one that matters is chosen by `pickSubscription`. Null when
   * they have never had one.
   */
  async subscriptionOf(customerId: string): Promise<BillingSubscription | null> {
    const list = await this.client().subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
    const chosen = pickSubscription(list.data);
    return chosen ? toBillingSubscription(chosen) : null;
  }

  /** End a subscription now — the shop's account is being deleted, and a card must not keep being charged for it. */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.client().subscriptions.cancel(subscriptionId);
    this.logger.log(`Cancelled subscription ${subscriptionId}`);
  }

  /**
   * Verify a webhook's signature and return the event.
   *
   * The raw body is required, unparsed: the signature is computed over the exact
   * bytes Stripe sent, so anything that re-serialises the JSON first (key order,
   * whitespace, unicode escaping) invalidates it. Without this check the webhook
   * endpoint is an unauthenticated, internet-facing "mark this paid" button.
   */
  constructEvent(rawBody: Buffer | string, signature: string | undefined): Stripe.Event {
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      throw new ServiceUnavailableException('Webhooks are not configured — STRIPE_WEBHOOK_SECRET is unset.');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }
    try {
      return this.client().webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      this.logger.warn(`Rejected a webhook with a bad signature: ${String(error)}`);
      throw new BadRequestException('Invalid webhook signature');
    }
  }
}

// ── billing helpers (pure) ──────────────────────────────────────────────────

/** Fixed, so the dashboard shows one product for the subscription whatever prices it has had. */
const SUBSCRIPTION_PRODUCT_ID = 'sougouba_merchant_subscription';
/** How this API recognises the customer-portal configuration it created. */
const PORTAL_TAG = 'merchant-subscription';

/** `sougouba_merchant_monthly_cad_7000` — the amount is part of the key, see `subscriptionPrice`. */
export function subscriptionPriceKey(amountCad: number): string {
  return `sougouba_merchant_monthly_cad_${Math.round(amountCad * 100)}`;
}

export interface BillingSubscription {
  id: string;
  status: Stripe.Subscription.Status;
  /** End of the month already paid for — when the next charge is due, or when a cancelled subscription stops. */
  currentPeriodEnd: string | null;
  /** Set once the merchant has cancelled: the subscription runs until then and does not renew. */
  cancelAt: string | null;
  priceCad: number | null;
}

/**
 * Which of a customer's subscriptions describes their standing.
 *
 * A live one beats a dead one whatever their dates — a shop that cancelled in
 * March and subscribed again in May is subscribed. Among live ones (there
 * should only be one) and among dead ones, the most recent.
 */
export function pickSubscription<T extends { status: Stripe.Subscription.Status; created: number }>(list: T[]): T | null {
  const ended = (s: T) => s.status === 'canceled' || s.status === 'incomplete_expired';
  const newestFirst = [...list].sort((a, b) => b.created - a.created);
  return newestFirst.find((s) => !ended(s)) ?? newestFirst[0] ?? null;
}

const iso = (seconds: number | null | undefined): string | null =>
  seconds === null || seconds === undefined ? null : new Date(seconds * 1000).toISOString();

export function toBillingSubscription(subscription: Stripe.Subscription): BillingSubscription {
  // Since Stripe's 2025 API versions the billing period lives on the item, not the subscription.
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end ?? null;
  return {
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: iso(periodEnd),
    cancelAt: iso(subscription.cancel_at ?? (subscription.cancel_at_period_end ? periodEnd : null)),
    priceCad: item?.price?.unit_amount === null || item?.price?.unit_amount === undefined ? null : item.price.unit_amount / 100,
  };
}
