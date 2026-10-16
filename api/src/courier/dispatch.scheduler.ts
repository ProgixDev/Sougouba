import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { isServerless } from '../config/runtime.js';
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

  /** Just the two vars `isServerless` reads, so the check stays a pure function. */
  private get env(): Pick<Env, 'VERCEL' | 'SERVERLESS'> {
    return {
      VERCEL: this.config.get('VERCEL', { infer: true }),
      SERVERLESS: this.config.get('SERVERLESS', { infer: true }),
    };
  }

  /**
   * The timer that owns the loop on a long-running host.
   *
   * On a serverless host it stands down and `tick` is driven over HTTP
   * instead — see `config/runtime.ts` and `cron/cron.controller.ts`. The check
   * is here rather than on `tick` itself so that cron and `nudge` can still
   * call the real thing.
   */
  @Interval(TICK_MS)
  async scheduledTick(): Promise<void> {
    if (isServerless(this.env)) return;
    await this.tick();
  }

  /**
   * Drive one tick from an HTTP request, on hosts where no timer runs.
   *
   * Platform cron can only be trusted to fire once a minute, which is slower
   * than `OFFER_TIMEOUT_MS`. So the requests that actually care about dispatch
   * also drive it: a courier coming on shift, polling offers, heartbeating or
   * declining, and a customer's order being placed. Each of those is a moment
   * when a tick is exactly what the caller wants to have happened.
   *
   * A no-op off serverless, where the 5-second timer already covers it — two
   * tickers would only burn two ticks to do one tick's work.
   *
   * Awaited rather than fired and forgotten: a serverless instance can be
   * frozen the moment its response is sent, so background work started here
   * might simply never run. `tick` swallows its own failures, so this cannot
   * turn a dispatch problem into a failed request for the caller.
   */
  async nudge(): Promise<void> {
    if (!isServerless(this.env)) return;
    await this.tick();
  }

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
