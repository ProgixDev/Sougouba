import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import type { Env } from '../../config/env.js';
import { isServerless } from '../../config/runtime.js';
import { previousPeriod } from './statement.js';
import { StatementsService } from './statements.service.js';

/**
 * The 1st of the month at 06:00 Montréal time: the month that just ended is
 * closed, and every shop that sold or was refunded in it gets its statement.
 *
 * Six in the morning rather than midnight: late enough that an order handed
 * over at 23:55 on the last day has long been marked delivered, early enough
 * that the email is waiting when a shop opens.
 *
 * Same single-instance caveat as the payout scheduler, with less at stake: a
 * statement exists once per shop per month whatever runs, so two replicas
 * firing together produce one statement and, at worst, one duplicated email.
 */
@Injectable()
export class StatementsScheduler {
  private readonly logger = new Logger(StatementsScheduler.name);
  private running = false;

  constructor(
    private readonly statements: StatementsService,
    private readonly config: ConfigService<Env, true>
  ) {}

  private get env(): Pick<Env, 'VERCEL' | 'SERVERLESS'> {
    return {
      VERCEL: this.config.get('VERCEL', { infer: true }),
      SERVERLESS: this.config.get('SERVERLESS', { infer: true }),
    };
  }

  /** The timer that owns it on a long-running host. On serverless it stands down and platform cron calls `monthly`. */
  @Cron('0 6 1 * *', { timeZone: 'America/Montreal' })
  async scheduledMonthly(): Promise<void> {
    if (isServerless(this.env)) return;
    await this.monthly();
  }

  /**
   * Close a month. With no argument, the one before today's — what the timer
   * wants. `period` and `email` exist for a person re-running a month by hand:
   * issuing the statements for a past month without mailing every shop again.
   */
  async monthly(period?: string, email = true): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    if (this.running) {
      this.logger.warn('Skipping the monthly statements: the previous run is still going');
      return;
    }
    this.running = true;
    try {
      await this.statements.closeMonth(period ?? previousPeriod(new Date()), { email });
    } catch (error) {
      // Never let this kill the cron — a thrown error would stop every future month.
      this.logger.error(`Monthly statements failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
