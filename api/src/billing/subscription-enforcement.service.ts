import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { NotifyService } from '../notifications/notify.service.js';
import {
  subscriptionStanding,
  type SubscriptionFacts,
  type SubscriptionRule,
  type SubscriptionStanding,
} from './subscription-standing.js';

/** The two statuses this service moves a shop between. It never reads or writes any other. */
type ShopStatus = 'approved' | 'subscription_hold';

interface Shop {
  id: string;
  status: ShopStatus;
}

/** What a pass over one shop did to it. */
export type EnforcementOutcome = 'held' | 'released' | 'unchanged';

export interface EnforcementResult {
  outcome: EnforcementOutcome;
  /** Where the shop's subscription stands under the rule in force — what `outcome` was decided on. */
  standing: SubscriptionStanding;
  /** Whether the subscription is required to sell right now. */
  required: boolean;
}

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

/**
 * The monthly subscription, enforced (CDC addendum v1.1, §05).
 *
 * When an administrator requires the subscription, an approved shop sells only
 * while its subscription is in order (`subscriptionStanding` is the rule). A
 * shop that is not is moved to `subscription_hold`: it leaves the catalogue and
 * takes no new order, because every customer-facing read asks for `approved`.
 * Orders already placed are carried through, and what the shop earned is still
 * paid. The moment the subscription is in order again, the shop is moved back.
 *
 * **Only `approved` ⇄ `subscription_hold`, ever.** A pending, rejected or
 * suspended shop is an administrator's business and is never touched — the
 * database function behind `settle` refuses to, whatever it is asked.
 *
 * A shop is looked at whenever something that could change the answer happens:
 * Stripe reports on its subscription, the merchant opens their subscription
 * screen, an administrator approves or reinstates it, or changes the rule.
 * `sweep` goes over every shop for the one thing that happens on its own —
 * time running out on a grace period — and to heal anything a missed event
 * left behind.
 */
@Injectable()
export class SubscriptionEnforcementService {
  private readonly logger = new Logger(SubscriptionEnforcementService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService,
    private readonly config: ConfigService<Env, true>
  ) {}

  /**
   * The rule as it stands now.
   *
   * Required only when a shop could actually comply: with no fee set there is
   * nothing to subscribe to, and without Stripe there is nowhere to pay it.
   * Requiring it then would take every shop offline with no way back.
   */
  async rule(): Promise<SubscriptionRule> {
    const settings = await this.settings.all();
    return {
      required: settings.subscriptionRequired && this.billable(settings.monthlySubscriptionCad),
      graceDays: settings.subscriptionGraceDays,
    };
  }

  /**
   * Put one shop where its subscription says it belongs, and say where that is.
   *
   * A shop this service may not move — pending, rejected, suspended — is left
   * alone and still gets its standing back: its owner's screen shows it.
   *
   * `silent` moves it without telling the merchant — for a caller about to
   * send a message of its own that says the same thing (an approval).
   */
  async apply(vendorId: string, opts: { silent?: boolean } = {}): Promise<EnforcementResult> {
    const [rule, shop, facts] = await Promise.all([this.rule(), this.shop(vendorId), this.factsOf(vendorId)]);
    const standing = subscriptionStanding(rule, facts, new Date());
    const outcome = shop ? await this.settle(shop, rule, standing, opts) : 'unchanged';
    return { outcome, standing, required: rule.required };
  }

  /**
   * Every shop. Safe to run as often as anyone likes, and from two places at
   * once: a shop already where it belongs is not written to, and the database
   * moves a shop once whoever asks.
   */
  async sweep(): Promise<{ held: number; released: number }> {
    const rule = await this.rule();
    // With the rule off there is nobody to take offline: only shops still held
    // need a look, to be brought back.
    const [shops, facts] = await Promise.all([
      this.shops(rule.required ? ['approved', 'subscription_hold'] : ['subscription_hold']),
      rule.required ? this.facts() : Promise.resolve(new Map<string, SubscriptionFacts>()),
    ]);

    const now = new Date();
    const moved = { held: 0, released: 0 };
    for (const shop of shops) {
      try {
        const outcome = await this.settle(shop, rule, subscriptionStanding(rule, facts.get(shop.id) ?? null, now));
        if (outcome !== 'unchanged') moved[outcome] += 1;
      } catch (error) {
        // One shop that could not be moved must not leave the others where they are.
        this.logger.error(`Subscription pass: shop ${shop.id} could not be settled: ${String(error)}`);
      }
    }
    if (moved.held || moved.released) {
      this.logger.log(`Subscription pass: ${moved.held} shop(s) taken offline, ${moved.released} brought back`);
    }
    return moved;
  }

  /**
   * What requiring the subscription would do, for the administrator about to
   * switch it on: how many shops are live or held, and how many of them have
   * no subscription in order today.
   *
   * `enforceable` is false when requiring it would do nothing at all — no fee
   * is set, or this server cannot reach Stripe.
   */
  async impact(): Promise<{ shops: number; notInOrder: number; enforceable: boolean; graceDays: number }> {
    const [settings, rule, shops, facts] = await Promise.all([
      this.settings.all(),
      this.rule(),
      this.shops(['approved', 'subscription_hold']),
      this.facts(),
    ]);
    const now = new Date();
    const asRequired: SubscriptionRule = { required: true, graceDays: rule.graceDays };
    const notInOrder = shops.filter((shop) => !subscriptionStanding(asRequired, facts.get(shop.id) ?? null, now).inOrder).length;
    return {
      shops: shops.length,
      notInOrder,
      enforceable: this.billable(settings.monthlySubscriptionCad),
      graceDays: rule.graceDays,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────

  private billable(monthlySubscriptionCad: number): boolean {
    return monthlySubscriptionCad > 0 && Boolean(this.config.get('STRIPE_SECRET_KEY', { infer: true }));
  }

  private async settle(
    shop: Shop,
    rule: SubscriptionRule,
    standing: SubscriptionStanding,
    opts: { silent?: boolean } = {}
  ): Promise<EnforcementOutcome> {
    const hold = !standing.inOrder;
    if (hold === (shop.status === 'subscription_hold')) return 'unchanged';

    // What the log says moved it. Coming back is either the payment, or the
    // rule itself being lifted.
    const cause = hold ? (standing.cause ?? 'never_subscribed') : rule.required ? 'in_order' : 'not_required';
    const moved = await unwrapRpc<boolean>(
      this.db.rpc('vendor_subscription_hold', { p_vendor_id: shop.id, p_hold: hold, p_cause: cause })
    );
    // False: the shop was no longer where it was read — an administrator
    // suspended it meanwhile, or another pass got there first.
    if (!moved) return 'unchanged';

    this.logger.log(`Shop ${shop.id} ${hold ? 'taken offline' : 'brought back online'} (subscription: ${cause})`);
    if (!opts.silent) {
      if (hold) await this.notify.shopTakenOffline(shop.id, standing.cause ?? 'never_subscribed');
      else await this.notify.shopBackOnline(shop.id);
    }
    return hold ? 'held' : 'released';
  }

  /** The shop, if it is one this service may move. */
  private shop(vendorId: string): Promise<Shop | null> {
    return unwrap<Shop | null>(
      this.db.from('vendors').select('id, status').eq('id', vendorId).in('status', ['approved', 'subscription_hold']).maybeSingle()
    );
  }

  private async shops(statuses: ShopStatus[]): Promise<Shop[]> {
    const all: Shop[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await unwrap<Shop[]>(
        this.db
          .from('vendors')
          .select('id, status')
          .in('status', statuses)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
      );
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  }

  private async factsOf(vendorId: string): Promise<SubscriptionFacts | null> {
    // `*`, like `SubscriptionsService`: a database `0062` has not reached has no
    // `past_due_since`, and naming it would fail the read.
    const row = await unwrap<FactsRow | null>(
      this.db.from('merchant_subscriptions').select('*').eq('vendor_id', vendorId).maybeSingle()
    );
    return row ? toFacts(row) : null;
  }

  private async facts(): Promise<Map<string, SubscriptionFacts>> {
    const byVendor = new Map<string, SubscriptionFacts>();
    for (let from = 0; ; from += PAGE) {
      const page = await unwrap<FactsRow[]>(
        this.db
          .from('merchant_subscriptions')
          .select('*')
          .order('vendor_id', { ascending: true })
          .range(from, from + PAGE - 1)
      );
      for (const row of page) byVendor.set(row.vendor_id, toFacts(row));
      if (page.length < PAGE) return byVendor;
    }
  }
}

interface FactsRow {
  vendor_id: string;
  status: SubscriptionFacts['status'];
  past_due_since?: string | null;
}

const toFacts = (row: FactsRow): SubscriptionFacts => ({ status: row.status, pastDueSince: row.past_due_since ?? null });
