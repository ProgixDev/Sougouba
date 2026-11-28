import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Env } from '../config/env.js';
import { isServerless } from '../config/runtime.js';
import { SubscriptionEnforcementService } from './subscription-enforcement.service.js';

/** Long enough after start-up for the server to be answering requests first. */
const AFTER_BOOT_MS = 30_000;

/**
 * Every hour: go over every shop's subscription (`SubscriptionEnforcementService.sweep`).
 *
 * Almost everything that moves a shop is an event and is handled as it
 * happens. This is for the one thing that is not — a grace period running out,
 * which nobody reports — and for whatever an event that never arrived left
 * behind. An hour is the most a shop can stay live past its grace.
 *
 * **Once at start-up too.** A host that puts the server to sleep when idle
 * stops its timers with it; a process that is never up at the top of an hour
 * would never run the pass. Waking up *is* starting up, so the pass runs then.
 *
 * Two replicas firing together is harmless here: a shop is moved once whoever
 * asks, and one already where it belongs is not written to.
 */
@Injectable()
export class SubscriptionEnforcementScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionEnforcementScheduler.name);
  private running = false;

  constructor(
    private readonly enforcement: SubscriptionEnforcementService,
    private readonly config: ConfigService<Env, true>
  ) {}

  private get env(): Pick<Env, 'VERCEL' | 'SERVERLESS'> {
    return {
      VERCEL: this.config.get('VERCEL', { infer: true }),
      SERVERLESS: this.config.get('SERVERLESS', { infer: true }),
    };
  }

  onApplicationBootstrap(): void {
    if (isServerless(this.env)) return;
    // `unref`: a pending pass must not keep a process alive that is shutting down.
    setTimeout(() => void this.hourly(), AFTER_BOOT_MS).unref();
  }

  /** The timer that owns it on a long-running host. On serverless it stands down and platform cron calls `hourly`. */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledHourly(): Promise<void> {
    if (isServerless(this.env)) return;
    await this.hourly();
  }

  async hourly(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      await this.enforcement.sweep();
    } catch (error) {
      // Never let this kill the cron — a thrown error would stop every future pass.
      this.logger.error(`Subscription pass failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
