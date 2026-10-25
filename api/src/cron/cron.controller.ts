import { Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { RetentionScheduler } from '../admin/retention.scheduler.js';
import { PayoutsScheduler } from '../billing/payouts.scheduler.js';
import { DispatchScheduler } from '../courier/dispatch.scheduler.js';
import { CronGuard } from './cron.guard.js';

/**
 * The background jobs, exposed as HTTP so a serverless host can run them.
 *
 * On a VPS none of this is used: the in-process timers fire and these routes
 * just sit there, refusing anyone without the secret. That is the point — the
 * schedulers were built, tested and walked as timers, so rather than rewrite
 * them for a platform that cannot hold a process, this hands the platform a
 * doorbell for the methods they already call.
 *
 * Each job is exposed twice, as `GET` (what Vercel Cron issues) and as `POST`
 * (what a human reaching for curl will type), by two handlers delegating to
 * one method. Two route decorators on a *single* handler would not work:
 * `@Get` and `@Post` write the same Nest metadata key, so one silently wins
 * and the other route never exists.
 *
 * The work is not idempotent in the HTTP sense, but each job defends itself:
 * dispatch is a compare-and-swap, payouts carry a per-courier idempotency key,
 * and the purge only deletes what is already past its retention window.
 */
@ApiExcludeController()
@UseGuards(CronGuard)
@Controller('internal/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly dispatch: DispatchScheduler,
    private readonly payouts: PayoutsScheduler,
    private readonly retention: RetentionScheduler
  ) {}

  /**
   * One dispatch tick: expire offers nobody answered, offer waiting orders to
   * the nearest free courier.
   *
   * **Not scheduled** (removed from `vercel.json` on 2026-10-25). It ran every
   * minute as a safety net, and on Vercel that cost far more than it caught:
   * a container woken 1,440 times a day never scales to zero, so the API was
   * billed as an always-on machine — 88 % of the team's provisioned memory
   * from 16 to 19 October, while nothing was being dispatched.
   *
   * Nothing depends on it. `DispatchScheduler.nudge` already runs a tick from
   * every request that can make dispatch possible: an order placed, a courier
   * coming on shift, and an online courier's heartbeat and 5-second offer poll
   * — which is also what expires and re-offers a lapsed offer. With no courier
   * online there is nobody to offer to, so a timer would only find nothing.
   *
   * Kept as a route so an external scheduler, or a person, can still force a
   * tick. On the VPS the 5-second timer owns dispatch and this goes unused.
   */
  @Get('dispatch')
  dispatchTickViaGet(): Promise<{ ok: true }> {
    return this.dispatchTick();
  }

  @Post('dispatch')
  dispatchTickViaPost(): Promise<{ ok: true }> {
    return this.dispatchTick();
  }

  private async dispatchTick(): Promise<{ ok: true }> {
    await this.dispatch.tick();
    return { ok: true };
  }

  /** The Friday 03:00 courier payout batch. */
  @Get('payouts')
  weeklyPayoutsViaGet(): Promise<{ ok: true }> {
    return this.weeklyPayouts();
  }

  @Post('payouts')
  weeklyPayoutsViaPost(): Promise<{ ok: true }> {
    return this.weeklyPayouts();
  }

  private async weeklyPayouts(): Promise<{ ok: true }> {
    await this.payouts.weekly();
    return { ok: true };
  }

  /** The nightly purge of location pings and delivery proofs past retention. */
  @Get('retention')
  nightlyRetentionViaGet(): Promise<{ ok: true }> {
    return this.nightlyRetention();
  }

  @Post('retention')
  nightlyRetentionViaPost(): Promise<{ ok: true }> {
    return this.nightlyRetention();
  }

  private async nightlyRetention(): Promise<{ ok: true }> {
    await this.retention.nightly();
    return { ok: true };
  }
}
