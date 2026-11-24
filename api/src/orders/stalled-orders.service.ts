import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { isServerless } from '../config/runtime.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { MailService } from '../mail/mail.service.js';
import { money, orderReference } from '../notifications/messages.js';
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

/**
 * The automatic sweep never touches an order that has been waiting longer than
 * this. Past a day it is not a dispatch problem any more, and a timer
 * cancelling it — on the day this shipped, every such order at once — would be
 * a decision nobody made. Those stay on the back office's list, for a person.
 */
const SWEEP_WINDOW_MIN = 24 * 60;

/**
 * Orders that are packed and that no courier has taken.
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
    private readonly config: ConfigService<Env, true>
  ) {}

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
      await this.stalled.sweep();
    } finally {
      this.running = false;
    }
  }
}
