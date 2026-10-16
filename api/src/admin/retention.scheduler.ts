import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { isServerless } from '../config/runtime.js';
import { RetentionService } from './retention.service.js';

/**
 * Runs the retention purge once a day.
 *
 * Nightly rather than hourly because nothing here is urgent to the minute — a
 * retention period is a promise measured in days, and running it more often
 * only multiplies the chance of doing it during a traffic peak.
 *
 * ⚠️ Same single-instance caveat as `DispatchScheduler`: two replicas would
 * both fire. Unlike dispatch, a duplicate purge is harmless — the second run
 * finds nothing left to delete — but the fix when this scales is the same
 * Postgres advisory lock, and this file is where someone adding a replica will
 * be standing.
 */
@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);
  private running = false;

  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService<Env, true>
  ) {}

  /** Just the two vars `isServerless` reads, so the check stays a pure function. */
  private get env(): Pick<Env, 'VERCEL' | 'SERVERLESS'> {
    return {
      VERCEL: this.config.get('VERCEL', { infer: true }),
      SERVERLESS: this.config.get('SERVERLESS', { infer: true }),
    };
  }


  /**
   * The timer that owns the nightly retention purge on a long-running host. On serverless it
   * stands down and platform cron calls `nightly` directly — see
   * `cron/cron.controller.ts`.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'America/Montreal' })
  async scheduledNightly(): Promise<void> {
    if (isServerless(this.env)) return;
    await this.nightly();
  }

  async nightly(): Promise<void> {
    // Tests boot the app; a purge firing mid-suite would delete rows a test put there.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;

    if (this.running) {
      this.logger.warn('Skipping the retention purge: the previous run is still going');
      return;
    }
    this.running = true;

    try {
      const report = await this.retention.purge();
      // Logged even when it deletes nothing. "The purge ran and there was
      // nothing to delete" and "the purge has not run in three weeks" look
      // identical from the outside otherwise, and only one of them is fine.
      this.logger.log(
        `Retention purge: ${report.courierLocations} location ping(s), ${report.deliveryProofs} proof(s)` +
          (report.deliveryProofsHeld > 0 ? `, ${report.deliveryProofsHeld} proof(s) held (${report.skippedReason})` : '')
      );
    } catch (error) {
      // Never let a failure kill the schedule — the next night should try again.
      this.logger.error(`Retention purge failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
