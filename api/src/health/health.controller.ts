import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DB } from '../db/db.module.js';
import type { Db } from '../db/client.js';
import { unwrap } from '../db/unwrap.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Liveness only — no DB round trip, so a slow database never fails a load balancer's health check. */
  @Get()
  live() {
    return { status: 'ok', service: 'sougouba-api' };
  }

  /**
   * Readiness — proves the data path actually works, for the Phase 0 review gate.
   *
   * The cheapest real round trip through PostgREST: `head` sends no rows back,
   * `count: 'exact'` still forces the query to execute, and `categories` is a
   * small, always-present table. There is no `select 1` over REST.
   */
  @Get('db')
  async ready() {
    await unwrap(this.db.from('categories').select('id', { count: 'exact', head: true }));
    return { status: 'ok', database: 'reachable' };
  }
}
