import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { isServerless } from '../config/runtime.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { MailService } from '../mail/mail.service.js';
import { money, orderReference } from '../notifications/messages.js';
import { NotifyService } from '../notifications/notify.service.js';
import { OrderCancellationService } from './order-cancellation.service.js';

/** A packed order nobody is carrying, as `dispatch_stalled_orders` reports it. */
export interface StalledOrder {
  orderId: string;
  vendorId: string;
  vendorName: string;
  customerName: string | null;
  totalCad: number;
  waitingSince: string;
  waitingMin: number;
  /** Staff were already told about this wait. */
  alerted: boolean;
  /** How many couriers were offered the run so far — 0 means nobody was even in range. */
  offers: number;
}

/** An order the shop has not answered, as `orders_awaiting_shop` reports it. */
export interface UnansweredOrder {
  orderId: string;
  vendorId: string;
  vendorName: string;
  customerName: string | null;
  totalCad: number;
  waitingSince: string;
  waitingMin: number;
  /** The shop was already reminded. */
  reminded: boolean;
}

/** A run accepted and not picked up, past the time the courier was expected, as `deliveries_awaiting_pickup` reports it. */
export interface LatePickup {
  orderId: string;
  courierId: string;
  courierName: string;
  vendorId: string;
  vendorName: string;
  customerName: string | null;
  totalCad: number;
  acceptedAt: string;
  /** When the courier was expected at the shop: acceptance plus the travel time estimated then. */
  dueAt: string;
  lateMin: number;
  reminded: boolean;
  /** The courier reported a problem on this run — the timer leaves it to a person. */
  hasOpenIssue: boolean;
}

/**
 * The automatic sweep never touches an order that has been waiting longer than
 * this. Past a day it is not a dispatch problem any more, and a timer
 * cancelling it — on the day this shipped, every such order at once — would be
 * a decision nobody made. Those stay on the back office's list, for a person.
 */
const SWEEP_WINDOW_MIN = 24 * 60;

/**
 * The three places an order waits on somebody who may never come: the shop's
 * answer (`sweepUnanswered`), a courier who accepted and has not come
 * (`sweepLatePickups`), and a courier for a packed order nobody took
 * (`sweep`). Each is bounded by a pair of delays set in the back office. The
 * first and the last end in a cancellation, refunded in full, through
 * `OrderCancellationService`; the middle one puts the order back in dispatch.
 *
 * On the second of the two: orders that are packed and that no courier has taken.
 *
 * Dispatch offers a run to one courier at a time and never to the same one
 * twice, so when everyone in range has passed — or nobody is on shift — the
 * order simply waits, and it used to wait forever. Two delays, both set in the
 * back office, now bound that:
 *
 * 1. after `noCourierAlertMin`, staff are told (an email, and the list the
 *    back office shows) — a person can still call a courier or the shopper;
 * 2. after `noCourierCancelMin`, the order is cancelled and refunded in full.
 *    Set to 0, nothing is cancelled automatically and step 1 is all there is.
 *
 * A run a courier handed back restarts the clock: the wait is measured from
 * the hand-back, not from when the order was first packed.
 */
@Injectable()
export class StalledOrdersService {
  private readonly logger = new Logger(StalledOrdersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cancellation: OrderCancellationService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    private readonly notify: NotifyService
  ) {}

  // ── a shop that never answers ─────────────────────────────────────────────

  /**
   * Orders the shop has not accepted, past the delay after which the timer
   * would have cancelled them — the ones it did not, because they are older
   * than a day or because automatic cancellation is off. What the back office
   * lists; no age limit.
   */
  async listUnanswered(): Promise<{ remindAfterMin: number; cancelAfterMin: number; orders: UnansweredOrder[] }> {
    const delays = await this.shopDelays();
    if (!delays) return { remindAfterMin: 0, cancelAfterMin: 0, orders: [] };
    // With cancellation off there is no "should have been cancelled by now": list what is past the reminder instead.
    const threshold = delays.cancelAfterMin > 0 ? delays.cancelAfterMin : Math.max(delays.remindAfterMin, 1);
    return { ...delays, orders: await this.unanswered(threshold, null) };
  }

  /**
   * One pass over orders still waiting for the shop's answer.
   *
   * The shopper paid when they ordered, so every minute here is money held for
   * a shop that may be closed, busy, or holding a phone on silent. The large
   * delivery platforms all bound this the same way — about ten minutes, with a
   * prod to the shop first — and so does this:
   *
   * 1. after `shopConfirmRemindMin` the shop gets one reminder push, saying how
   *    long it has left (0 = no reminder);
   * 2. after `shopConfirmCancelMin` the order is cancelled and refunded in
   *    full, and both sides are told why (0 = never automatically).
   *
   * The sweep runs once a minute, so each step lands within a minute after its
   * delay. Never throws.
   */
  async sweepUnanswered(): Promise<{ reminded: number; cancelled: number }> {
    try {
      const delays = await this.shopDelays();
      if (!delays) return { reminded: 0, cancelled: 0 };
      const { remindAfterMin, cancelAfterMin } = delays;
      if (remindAfterMin === 0 && cancelAfterMin === 0) return { reminded: 0, cancelled: 0 };

      // From the earlier of the two delays that is switched on.
      const from = Math.min(...[remindAfterMin, cancelAfterMin].filter((m) => m > 0));
      const orders = await this.unanswered(from, SWEEP_WINDOW_MIN);
      let reminded = 0;
      let cancelled = 0;

      for (const order of orders) {
        if (cancelAfterMin > 0 && order.waitingMin >= cancelAfterMin) {
          if (await this.cancellation.bySystem(order.orderId, 'shop_no_response')) cancelled++;
          continue;
        }
        if (remindAfterMin > 0 && order.waitingMin >= remindAfterMin && !order.reminded && (await this.claimReminder(order))) {
          const minutesLeft = cancelAfterMin > 0 ? Math.max(cancelAfterMin - order.waitingMin, 1) : null;
          await this.notify.orderWaitingForShop(order.orderId, minutesLeft);
          reminded++;
        }
      }

      if (cancelled > 0 || reminded > 0) {
        this.logger.warn(`Shop not answering: ${reminded} reminder(s) sent, ${cancelled} order(s) cancelled and refunded`);
      }
      return { reminded, cancelled };
    } catch (error) {
      this.logger.error(`Unanswered-order sweep failed: ${String(error)}`);
      return { reminded: 0, cancelled: 0 };
    }
  }

  /** The two delays, or null against a database older than migration 0055 — the sweep then stands down. */
  private async shopDelays(): Promise<{ remindAfterMin: number; cancelAfterMin: number } | null> {
    const { data, error } = await this.db.from('platform_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    // `undefined` → NaN: the columns are not there yet.
    const remindAfterMin = Number(row.shop_confirm_remind_min ?? Number.NaN);
    const cancelAfterMin = Number(row.shop_confirm_cancel_min ?? Number.NaN);
    if (!Number.isFinite(remindAfterMin) || !Number.isFinite(cancelAfterMin)) return null;
    return { remindAfterMin, cancelAfterMin };
  }

  private async unanswered(minWaitingMin: number, maxWaitingMin: number | null): Promise<UnansweredOrder[]> {
    const { data, error } = await this.db.rpc('orders_awaiting_shop', {
      p_min_waiting_min: minWaitingMin,
      p_max_waiting_min: maxWaitingMin as number,
    });
    if (error) throw new Error(`orders_awaiting_shop: ${error.code} ${error.message}`);
    return (data ?? []).map((row) => ({
      orderId: row.order_id,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      customerName: row.customer_name,
      totalCad: Number(row.total_cad),
      waitingSince: row.waiting_since,
      waitingMin: row.waiting_min,
      reminded: row.reminded,
    }));
  }

  /**
   * Mark the order as reminded, and say whether this call is the one that did:
   * two sweeps a moment apart must not both ring the shop's phone. Only an
   * order still `pending` — one accepted since the list was read needs no nudge.
   */
  private async claimReminder(order: UnansweredOrder): Promise<boolean> {
    const { data, error } = await this.db
      .from('orders')
      .update({ shop_reminded_at: new Date().toISOString() })
      .eq('id', order.orderId)
      .eq('status', 'pending')
      .is('shop_reminded_at', null)
      .select('id');
    if (error) {
      this.logger.error(`Could not mark order ${order.orderId} as reminded: ${error.code} ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  }

  // ── a courier who accepted and never came ─────────────────────────────────

  /**
   * Runs the timer would have taken back and did not: more than a day
   * overdue, a problem reported on them, or taking back is switched off. What
   * the back office lists; no age limit.
   */
  async listLatePickups(): Promise<{ remindAfterMin: number; releaseAfterMin: number; pickups: LatePickup[] }> {
    const delays = await this.courierDelays();
    if (!delays) return { remindAfterMin: 0, releaseAfterMin: 0, pickups: [] };
    const threshold = delays.releaseAfterMin > 0 ? delays.releaseAfterMin : Math.max(delays.remindAfterMin, 1);
    return { ...delays, pickups: await this.latePickups(threshold, null) };
  }

  /**
   * One pass over runs that were accepted and not picked up.
   *
   * Accepting takes the order out of dispatch, so a courier who then never
   * comes holds it hostage: nobody else is offered it. The clock is the
   * courier's own estimate — acceptance plus the travel time worked out then —
   * so one coming from far is not punished and one round the corner is not
   * waited on for long.
   *
   * 1. `courierLateRemindMin` past that time, the courier gets one reminder:
   *    pick it up, or hand it back (0 = no reminder);
   * 2. `courierLateReleaseMin` past it, the run is taken back and returns to
   *    dispatch, recorded as a `no_show` (0 = never automatically). The courier
   *    is told, is not paid for it, and is never offered that order again.
   *
   * A run with a problem reported on it is left alone: a courier standing at a
   * shop that will not hand the bag over is not a no-show, and a person reads
   * those. If no other courier takes the order, the no-courier sweep below
   * picks it up from there, its clock restarted. Never throws.
   */
  async sweepLatePickups(): Promise<{ reminded: number; released: number }> {
    try {
      const delays = await this.courierDelays();
      if (!delays) return { reminded: 0, released: 0 };
      const { remindAfterMin, releaseAfterMin } = delays;
      if (remindAfterMin === 0 && releaseAfterMin === 0) return { reminded: 0, released: 0 };

      const from = Math.min(...[remindAfterMin, releaseAfterMin].filter((m) => m > 0));
      const pickups = await this.latePickups(from, SWEEP_WINDOW_MIN);
      let reminded = 0;
      let released = 0;

      for (const pickup of pickups) {
        if (pickup.hasOpenIssue) continue;
        if (releaseAfterMin > 0 && pickup.lateMin >= releaseAfterMin) {
          if (await this.takeBack(pickup)) {
            released++;
            await this.notify.courierPickupOverdue(pickup.orderId, pickup.courierId, { kind: 'taken_back' });
          }
          continue;
        }
        if (remindAfterMin > 0 && pickup.lateMin >= remindAfterMin && !pickup.reminded && (await this.claimLateReminder(pickup))) {
          const minutesLeft = releaseAfterMin > 0 ? Math.max(releaseAfterMin - pickup.lateMin, 1) : null;
          await this.notify.courierPickupOverdue(pickup.orderId, pickup.courierId, { kind: 'late', minutesLeft });
          reminded++;
        }
      }

      if (released > 0 || reminded > 0) {
        this.logger.warn(`Courier not at pickup: ${reminded} reminder(s) sent, ${released} run(s) taken back and re-dispatched`);
      }
      return { reminded, released };
    } catch (error) {
      this.logger.error(`Late-pickup sweep failed: ${String(error)}`);
      return { reminded: 0, released: 0 };
    }
  }

  /** The two delays, or null against a database older than migration 0056 — the sweep then stands down. */
  private async courierDelays(): Promise<{ remindAfterMin: number; releaseAfterMin: number } | null> {
    const { data, error } = await this.db.from('platform_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const remindAfterMin = Number(row.courier_late_remind_min ?? Number.NaN);
    const releaseAfterMin = Number(row.courier_late_release_min ?? Number.NaN);
    if (!Number.isFinite(remindAfterMin) || !Number.isFinite(releaseAfterMin)) return null;
    return { remindAfterMin, releaseAfterMin };
  }

  private async latePickups(minLateMin: number, maxLateMin: number | null): Promise<LatePickup[]> {
    const { data, error } = await this.db.rpc('deliveries_awaiting_pickup', {
      p_min_late_min: minLateMin,
      p_max_late_min: maxLateMin as number,
    });
    if (error) throw new Error(`deliveries_awaiting_pickup: ${error.code} ${error.message}`);
    return (data ?? []).map((row) => ({
      orderId: row.order_id,
      courierId: row.courier_id,
      courierName: row.courier_name,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      customerName: row.customer_name,
      totalCad: Number(row.total_cad),
      acceptedAt: row.accepted_at,
      dueAt: row.due_at,
      lateMin: row.late_min,
      reminded: row.reminded,
      hasOpenIssue: row.has_open_issue,
    }));
  }

  /**
   * Take the run back, through the same function a courier's own hand-back
   * uses. It only matches a run that is still this courier's and still not
   * picked up — so one who picks up in the second this fires keeps the run,
   * and that is reported here as "nothing taken back", not as an error.
   */
  private async takeBack(pickup: LatePickup): Promise<boolean> {
    const { error } = await this.db.rpc('delivery_release', {
      p_order_id: pickup.orderId,
      p_courier_id: pickup.courierId,
      p_reason: 'no_show',
      p_note: null as unknown as string,
    });
    if (!error) return true;
    if (error.code !== NOT_RELEASABLE) {
      this.logger.error(`Could not take back order ${pickup.orderId} from courier ${pickup.courierId}: ${error.code} ${error.message}`);
    }
    return false;
  }

  /** Mark this courier as reminded, once — on their delivery row, so the next courier on the order starts clean. */
  private async claimLateReminder(pickup: LatePickup): Promise<boolean> {
    const { data, error } = await this.db
      .from('order_deliveries')
      .update({ late_reminded_at: new Date().toISOString() })
      .eq('order_id', pickup.orderId)
      .eq('courier_id', pickup.courierId)
      .is('picked_up_at', null)
      .is('late_reminded_at', null)
      .select('order_id');
    if (error) {
      this.logger.error(`Could not mark the late reminder on order ${pickup.orderId}: ${error.code} ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  }

  // ── a packed order no courier takes ───────────────────────────────────────

  /** Everything waiting past the alert delay, oldest first — what the back office lists. No age limit. */
  async list(): Promise<{ alertAfterMin: number; cancelAfterMin: number; orders: StalledOrder[] }> {
    const delays = await this.delays();
    if (!delays) return { alertAfterMin: 0, cancelAfterMin: 0, orders: [] };
    return { ...delays, orders: await this.stalled(delays.alertAfterMin, null) };
  }

  /**
   * One pass: cancel what has waited past the second delay, tell staff about
   * what has just passed the first. Never throws — it runs on a timer.
   */
  async sweep(): Promise<{ alerted: number; cancelled: number }> {
    try {
      const delays = await this.delays();
      if (!delays) return { alerted: 0, cancelled: 0 };

      const orders = await this.stalled(delays.alertAfterMin, SWEEP_WINDOW_MIN);
      let cancelled = 0;
      const toAlert: StalledOrder[] = [];

      for (const order of orders) {
        if (delays.cancelAfterMin > 0 && order.waitingMin >= delays.cancelAfterMin) {
          if (await this.cancellation.bySystem(order.orderId, 'no_courier')) cancelled++;
          continue;
        }
        if (!order.alerted && (await this.claimAlert(order))) toAlert.push(order);
      }

      if (toAlert.length > 0) await this.alertStaff(toAlert, delays);
      if (cancelled > 0 || toAlert.length > 0) {
        this.logger.warn(`No courier: ${toAlert.length} order(s) flagged to staff, ${cancelled} cancelled and refunded`);
      }
      return { alerted: toAlert.length, cancelled };
    } catch (error) {
      this.logger.error(`Stalled-order sweep failed: ${String(error)}`);
      return { alerted: 0, cancelled: 0 };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * The two delays, or null when the database has no such settings — a deploy
   * that reached the API before migration 0054 reached the database. The sweep
   * then does nothing, rather than failing every minute.
   */
  private async delays(): Promise<{ alertAfterMin: number; cancelAfterMin: number } | null> {
    const { data, error } = await this.db.from('platform_settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const alertAfterMin = Number(row.no_courier_alert_min);
    const cancelAfterMin = Number(row.no_courier_cancel_min);
    if (!Number.isFinite(alertAfterMin) || !Number.isFinite(cancelAfterMin) || alertAfterMin < 1) return null;
    return { alertAfterMin, cancelAfterMin };
  }

  private async stalled(minWaitingMin: number, maxWaitingMin: number | null): Promise<StalledOrder[]> {
    const { data, error } = await this.db.rpc('dispatch_stalled_orders', {
      p_min_waiting_min: minWaitingMin,
      p_max_waiting_min: maxWaitingMin as number,
    });
    if (error) throw new Error(`dispatch_stalled_orders: ${error.code} ${error.message}`);
    return (data ?? []).map((row) => ({
      orderId: row.order_id,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      customerName: row.customer_name,
      totalCad: Number(row.total_cad),
      waitingSince: row.waiting_since,
      waitingMin: row.waiting_min,
      alerted: row.alerted,
      offers: row.offers,
    }));
  }

  /**
   * Mark the order as flagged, and say whether this call is the one that did.
   *
   * The stamp is the claim: two sweeps a moment apart both see the order as
   * not yet alerted, and only the one whose update lands sends the email. It is
   * conditional on the wait it was read for, so an order handed back later —
   * a new wait — can be flagged again.
   */
  private async claimAlert(order: StalledOrder): Promise<boolean> {
    const { data, error } = await this.db
      .from('orders')
      .update({ no_courier_alerted_at: new Date().toISOString() })
      .eq('id', order.orderId)
      .eq('status', 'ready')
      // Quoted: a timestamp's `+00:00` and colons are safe inside quotes whatever PostgREST's filter grammar makes of them bare.
      .or(`no_courier_alerted_at.is.null,no_courier_alerted_at.lt."${order.waitingSince}"`)
      .select('id');
    if (error) {
      this.logger.error(`Could not flag stalled order ${order.orderId}: ${error.code} ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  }

  /**
   * One email for the whole batch, to whoever watches operations. With no
   * address configured nothing is sent — the back office's list is then the
   * only alert, and the log line above still says it happened.
   */
  private async alertStaff(orders: StalledOrder[], delays: { alertAfterMin: number; cancelAfterMin: number }): Promise<void> {
    const to = this.config.get('STAFF_ALERT_EMAIL', { infer: true }) || this.config.get('SUPPORT_EMAIL', { infer: true });
    if (!to) return;

    const lines = orders.map(
      (o) =>
        `• ${orderReference(o.orderId)} — ${o.vendorName} — ${money(o.totalCad, 'fr')} — prête depuis ${o.waitingMin} min — ` +
        (o.offers === 0 ? 'aucun livreur à portée' : `${o.offers} livreur${o.offers > 1 ? 's' : ''} sollicité${o.offers > 1 ? 's' : ''}, aucun n’a accepté`)
    );
    const after =
      delays.cancelAfterMin > 0
        ? `Sans livreur, chaque commande sera annulée et remboursée automatiquement ${delays.cancelAfterMin} minutes après avoir été prête.`
        : 'L’annulation automatique est désactivée : ces commandes attendent une décision de votre part.';
    const single = orders.length === 1;

    try {
      await this.mail.send({
        to,
        subject: single
          ? `Commande ${orderReference(orders[0].orderId)} sans livreur depuis ${orders[0].waitingMin} min`
          : `${orders.length} commandes sans livreur`,
        text: [
          single ? 'Une commande est prête et aucun livreur ne l’a prise :' : 'Ces commandes sont prêtes et aucun livreur ne les a prises :',
          '',
          ...lines,
          '',
          after,
          'Elles sont listées dans le back-office, page Commandes, où vous pouvez les annuler avec un motif.',
        ].join('\n'),
      });
    } catch (error) {
      this.logger.error(`Stalled-order alert email failed: ${String(error)}`);
    }
  }
}

/** `delivery_release` raises this when the run is no longer the courier's to give up — picked up, or already released. */
const NOT_RELEASABLE = 'SGB12';

const TICK_MS = 60_000;

/**
 * Runs the sweep once a minute — the delays are in minutes, so nothing is
 * gained by looking more often.
 *
 * Same shape as `DispatchScheduler`: a timer on a host that holds a process,
 * and `tick()` exposed for the cron route on one that does not.
 */
@Injectable()
export class StalledOrdersScheduler {
  private readonly logger = new Logger(StalledOrdersScheduler.name);
  private running = false;

  constructor(
    private readonly stalled: StalledOrdersService,
    private readonly config: ConfigService<Env, true>
  ) {}

  @Interval(TICK_MS)
  async scheduledTick(): Promise<void> {
    const env = {
      VERCEL: this.config.get('VERCEL', { infer: true }),
      SERVERLESS: this.config.get('SERVERLESS', { infer: true }),
    };
    if (isServerless(env)) return;
    await this.tick();
  }

  async tick(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.running) {
      this.logger.warn('Skipping a stalled-order sweep: the previous one is still running');
      return;
    }
    this.running = true;
    try {
      // The shop's answer first: it is the shorter delay, and the earlier step.
      await this.stalled.sweepUnanswered();
      // Before the no-courier sweep: a run taken back here is an order with no courier from now.
      await this.stalled.sweepLatePickups();
      await this.stalled.sweep();
    } finally {
      this.running = false;
    }
  }
}
