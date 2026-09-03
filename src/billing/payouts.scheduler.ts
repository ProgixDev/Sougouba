import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { PaymentsService } from '../orders/payments.service.js';
import { PayoutsService } from './payouts.service.js';

/**
 * Friday at 03:00 Montreal time, matching `PAYOUT_WEEKDAY` in the mobile app's
 * `lib/courierAnalytics.ts` — which promises couriers a Friday payout and had
 * nothing behind it.
 *
 * The hour is deliberate: after the week's last deliveries have completed and
 * before anyone checks their earnings screen in the morning.
 *
 * ⚠️ Same single-instance caveat as the dispatch scheduler, and it matters more
 * here because this one moves money. Two replicas would both fire; the
 * per-courier idempotency key means Stripe would refuse the duplicate rather
 * than pay twice, so the failure mode is wasted calls and confusing logs rather
 * than double payment — but that is a guard, not a design. A real scheduler or
 * a Postgres advisory lock is Phase 10's job.
 */
@Injectable()
export class PayoutsScheduler {
  private readonly logger = new Logger(PayoutsScheduler.name);
  private running = false;

  constructor(
    private readonly payouts: PayoutsService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<Env, true>
  ) {}

  @Cron('0 3 * * 5', { timeZone: 'America/Montreal' })
  async weekly(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;

    // Without a key this would throw once a week into a log nobody reads. Say
    // so plainly instead — an unpaid courier is a real problem and "Stripe was
    // never configured" is the answer someone will need.
    if (!this.payments.isConfigured) {
      this.logger.error('Weekly courier payout skipped: STRIPE_SECRET_KEY is unset. Couriers are accruing unpaid.');
      return;
    }

    if (this.running) {
      this.logger.warn('Skipping the weekly payout: the previous run is still going');
      return;
    }
    this.running = true;

    try {
      const result = await this.payouts.runBatch();
      this.logger.log(`Weekly payout complete: ${JSON.stringify(result)}`);
    } catch (error) {
      // Never let this kill the cron — a thrown error here would stop every
      // future payout for the life of the process.
      this.logger.error(`Weekly payout failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
