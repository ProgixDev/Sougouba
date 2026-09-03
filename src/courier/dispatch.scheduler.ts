import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { DispatchService } from './dispatch.service.js';

/** Comfortably under `OFFER_TIMEOUT_MS` (30 s), so a lapsed offer moves on within a few seconds. */
const TICK_MS = 5_000;

/**
 * Runs the dispatch loop.
 *
 * Separated from `DispatchService` so the *decisions* stay callable and
 * testable without a timer attached — and so this file is the one place to
 * change when the loop needs to become a real job queue.
 *
 * ⚠️ **This is an in-process interval, which means it assumes a single
 * instance.** Two API replicas would both tick, and while the writes are safe
 * (the unique index on `(order_id, courier_id)` makes a duplicate offer a
 * no-op, and accepting is a compare-and-swap on `order_deliveries`), they would
 * burn two ticks' worth of work to do one tick's job and could hand the same
 * order to two different couriers in the same second — both offers valid, one
 * wasted. Before Phase 10 scales this past one instance it needs either a
 * Postgres advisory lock around the tick or a real scheduler
 * (pg_cron/pg-boss/BullMQ). Recorded here rather than in a ticket because this
 * file is where someone adding a replica will be standing.
 */
@Injectable()
export class DispatchScheduler {
  private readonly logger = new Logger(DispatchScheduler.name);
  private running = false;

  constructor(
    private readonly dispatch: DispatchService,
    private readonly config: ConfigService<Env, true>
  ) {}

  @Interval(TICK_MS)
  async tick(): Promise<void> {
    // Tests boot the app; a dispatcher firing in the background while they run
    // would write rows nobody asked for.
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;

    // A tick that overruns must not have a second one start on top of it —
    // `@Interval` fires on a wall clock, not on completion.
    if (this.running) {
      this.logger.warn('Skipping a dispatch tick: the previous one is still running');
      return;
    }
    this.running = true;

    try {
      const { expired, offered } = await this.dispatch.tick();
      if (expired > 0 || offered > 0) {
        this.logger.log(`Dispatch tick: ${expired} expired, ${offered} offered`);
      }
    } catch (error) {
      // Never let a tick's failure kill the interval — an unhandled rejection
      // here would stop dispatch for the life of the process, and no order
      // would ever be offered again.
      this.logger.error(`Dispatch tick failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
