import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';

import { DB } from '../db/db.module.js';
import type { Db } from '../db/client.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Liveness only — no DB round trip, so a slow database never fails a load balancer's health check. */
  @Get()
  live() {
    return { status: 'ok', service: 'sougouba-api' };
  }

  /** Readiness — proves the Supabase Postgres connection actually works, for the Phase 0 review gate. */
  @Get('db')
  async ready() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', database: 'reachable' };
  }
}
