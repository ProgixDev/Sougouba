import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { paginationSchema, type Page, type Pagination } from '../catalog/dto/query.dto.js';
import { containsPattern } from '../common/sql/like.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { PaymentsService } from '../orders/payments.service.js';
import { roundCad, toStripeAmount } from '../orders/pricing.js';

/** Friday, matching `PAYOUT_WEEKDAY` in the mobile app's `lib/courierAnalytics.ts`. */
export const PAYOUT_WEEKDAY = 5;

/**
 * Paying couriers — the thing the mock had **no equivalent of at all**.
 *
 * `pendingPayoutCad` and `nextPayoutDate` in `lib/courierAnalytics.ts` are a
 * read-only projection over `earningsCad`: they tell a courier what they are
 * owed and when it should arrive, and nothing anywhere ever moved a cent. This
 * is the code that does.
 *
 * The money leaves as a Stripe **Transfer** to the courier's Connect account,
 * which then pays out to their bank on Stripe's schedule. Doing it the other
 * way round — the platform disbursing to bank accounts itself — is what the
 * plan spends Phase 5 and 7 refusing, because it means holding bank details.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService
  ) {}

  /**
   * What a courier is owed but has not been paid.
   *
   * "Not been paid" is `paid_out_at is null` on the delivery row, not a date
   * range: a run missed by a failed batch has to appear in the next one, and
   * anything keyed on "since last Friday" would silently drop it forever.
   */
  async pendingFor(courierId: string) {
    // Summed here rather than in SQL: this is one courier's unpaid runs, a
    // handful of rows, and PostgREST has no `sum()`. The `paid_out_at is null`
    // predicate is the one that matters and it is still the database's.
    const rows = await unwrap<{ earningsCad: string }[]>(
      this.db
        .from('order_deliveries')
        .select('earningsCad:earnings_cad')
        .eq('courier_id', courierId)
        .not('delivered_at', 'is', null)
        .is('paid_out_at', null)
    );
    return {
      pendingCad: rows.reduce((sum, r) => sum + Number(r.earningsCad), 0),
      runCount: rows.length,
    };
  }

  /**
   * Pay every courier with completed, unpaid runs.
   *
   * Per courier, not one big transfer: each has their own Connect account, and
   * one courier's missing onboarding must not stop everyone else being paid —
   * which is why each is wrapped individually and a failure is recorded and
   * skipped rather than thrown.
   *
   * Every run is a `payout_runs` row and every courier in it a
   * `payout_attempts` row — paid, skipped (no Stripe account) or failed — so
   * the back office can show who was paid, who was not, and why. A second run
   * while one is in progress is refused by the database (`SGB11`).
   *
   * The idempotency key is the courier, the batch date and the amount, so a
   * retried batch on the same day cannot pay the same runs twice, while a
   * second batch later that day after new deliveries is a new transfer. The
   * ordering is deliberate: transfer first, then mark. The reverse can mark
   * runs paid that Stripe rejected, and an unpaid courier whose runs read as
   * settled has no way to notice.
   */
  async runBatch(
    opts: { trigger: 'schedule' | 'admin'; actorId?: string },
    now: Date = new Date()
  ): Promise<PayoutRunResult> {
    const batchKey = now.toISOString().slice(0, 10);

    const runId = await unwrapRpc<string>(
      this.db.rpc('payout_run_start', { p_trigger: opts.trigger, p_actor_id: opts.actorId ?? undefined }),
      (error) => {
        if (error.code === RUN_IN_PROGRESS) throw new ConflictException('Un versement est déjà en cours');
        throw error;
      }
    );

    let paid = 0;
    let skipped = 0;
    let failed = 0;
    let totalCad = 0;

    try {
      const rows = await unwrap<{ courier_id: string; pending_cad: string; run_count: number; account_id: string | null }[]>(
        this.db.rpc('payouts_owed')
      );
      const blocked = await this.unsettledTransfers(rows.map((r) => r.courier_id));

      for (const row of rows) {
        const amountCad = Number(row.pending_cad);
        if (amountCad <= 0) continue;
        const attempt = { run_id: runId, courier_id: row.courier_id, amount_cad: amountCad, run_count: row.run_count };

        if (!row.account_id) {
          // Not an error, and deliberately not fatal: a courier who has not
          // finished Connect onboarding keeps accruing and is paid by the first
          // batch after they do. The attempt row is what makes it visible.
          await this.record({ ...attempt, status: 'skipped', reason: 'no_account' });
          skipped++;
          continue;
        }

        // Stripe took an earlier transfer that never got stamped on the runs.
        // Paying again would pay those runs twice; a person has to settle it.
        if (blocked.has(row.courier_id)) {
          await this.record({
            ...attempt,
            status: 'failed',
            reason: 'record_error',
            error: `Virement ${blocked.get(row.courier_id)} déjà envoyé mais non enregistré — à vérifier avant de repayer`,
          });
          failed++;
          continue;
        }

        let transferId: string;
        try {
          transferId = await this.payments.transfer({
            accountId: row.account_id,
            amountCents: toStripeAmount(amountCad),
            idempotencyKey: `payout:${row.courier_id}:${batchKey}:${toStripeAmount(amountCad)}`,
            description: `Sougouba — courses jusqu'au ${batchKey}`,
          });
        } catch (error) {
          this.logger.error(`Payout to courier ${row.courier_id} failed: ${String(error)}`);
          await this.record({ ...attempt, status: 'failed', reason: 'stripe_error', error: errorMessage(error) });
          failed++;
          continue;
        }

        try {
          // Only now. The same `paid_out_at is null` predicate, so a run that
          // somehow got settled between the roll-up and here is not re-stamped.
          await unwrap(
            this.db
              .from('order_deliveries')
              .update({ paid_out_at: now.toISOString(), stripe_transfer_id: transferId })
              .eq('courier_id', row.courier_id)
              .not('delivered_at', 'is', null)
              .is('paid_out_at', null)
          );
        } catch (error) {
          this.logger.error(`Courier ${row.courier_id} paid by ${transferId} but the runs were not stamped: ${String(error)}`);
          await this.record({
            ...attempt,
            status: 'failed',
            reason: 'record_error',
            error: errorMessage(error),
            stripe_transfer_id: transferId,
          });
          failed++;
          continue;
        }

        await this.record({ ...attempt, status: 'paid', stripe_transfer_id: transferId });
        paid++;
        totalCad += amountCad;
      }
    } catch (error) {
      await this.finish(runId, { paid, skipped, failed, totalCad }, now, errorMessage(error));
      throw error;
    }

    await this.finish(runId, { paid, skipped, failed, totalCad }, now);
    this.logger.log(`Payout batch ${batchKey}: ${paid} paid (${totalCad} CAD), ${skipped} skipped, ${failed} failed`);
    return { runId, paid, skipped, failed, totalCad: roundCad(totalCad) };
  }

  /**
   * Couriers whose latest transfer reached Stripe but not `order_deliveries`
   * — a `record_error` with a transfer id and no paid attempt after it.
   */
  private async unsettledTransfers(courierIds: string[]): Promise<Map<string, string>> {
    if (courierIds.length === 0) return new Map();
    const rows = await unwrap<{ courier_id: string; status: string; reason: string | null; stripe_transfer_id: string | null }[]>(
      this.db
        .from('payout_attempts')
        .select('courier_id, status, reason, stripe_transfer_id')
        .in('courier_id', courierIds)
        .or('status.eq.paid,reason.eq.record_error')
        .order('created_at', { ascending: false })
    );
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.courier_id)) latest.set(r.courier_id, r);
    const blocked = new Map<string, string>();
    for (const [courierId, r] of latest) {
      if (r.reason === 'record_error' && r.stripe_transfer_id) blocked.set(courierId, r.stripe_transfer_id);
    }
    return blocked;
  }

  private async record(row: {
    run_id: string;
    courier_id: string;
    amount_cad: number;
    run_count: number;
    status: 'paid' | 'skipped' | 'failed';
    reason?: 'no_account' | 'stripe_error' | 'record_error';
    error?: string;
    stripe_transfer_id?: string;
  }): Promise<void> {
    await unwrap(this.db.from('payout_attempts').insert(row));
  }

  private async finish(
    runId: string,
    counts: { paid: number; skipped: number; failed: number; totalCad: number },
    now: Date,
    error?: string
  ): Promise<void> {
    await unwrap(
      this.db
        .from('payout_runs')
        .update({
          status: error ? 'failed' : 'done',
          finished_at: new Date().toISOString(),
          paid_count: counts.paid,
          skipped_count: counts.skipped,
          failed_count: counts.failed,
          paid_cad: roundCad(counts.totalCad),
          error: error ?? null,
        })
        .eq('id', runId)
    ).catch((e) => this.logger.error(`Payout run ${runId} (${now.toISOString()}) could not be closed: ${String(e)}`));
  }

  // ── back office ───────────────────────────────────────────────────────────

  insights() {
    return unwrap<Record<string, unknown>>(this.db.rpc('admin_payout_insights'));
  }

  async owed(query: PayoutOwedQuery): Promise<Page<unknown>> {
    const page = await unwrap<{ items: unknown[]; total: number }>(
      this.db.rpc('admin_payouts_owed', {
        p_filter: query.filter,
        p_search: query.search ? containsPattern(query.search) : undefined,
        p_limit: query.limit,
        p_offset: query.offset,
        p_sort: query.sort,
        p_dir: query.dir,
      })
    );
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
  }

  async attempts(query: PayoutAttemptQuery): Promise<Page<unknown>> {
    const page = await unwrap<{ items: unknown[]; total: number }>(
      this.db.rpc('admin_payout_attempts', {
        p_status: query.status,
        p_run_id: query.runId,
        p_courier_id: query.courierId,
        p_limit: query.limit,
        p_offset: query.offset,
      })
    );
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
  }

  async runs(query: Pagination): Promise<Page<unknown>> {
    const page = await unwrap<{ items: unknown[]; total: number }>(
      this.db.rpc('admin_payout_runs', { p_limit: query.limit, p_offset: query.offset })
    );
    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
  }
}

export type PayoutRunResult = { runId: string; paid: number; skipped: number; failed: number; totalCad: number };

export const payoutOwedQuerySchema = paginationSchema.extend({
  filter: z.enum(['all', 'no_account', 'failed']).default('all'),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['amount', 'oldest', 'name', 'runs']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export type PayoutOwedQuery = z.infer<typeof payoutOwedQuerySchema>;

export const payoutAttemptQuerySchema = paginationSchema.extend({
  status: z.enum(['paid', 'skipped', 'failed']).optional(),
  runId: z.string().uuid().optional(),
  courierId: z.string().uuid().optional(),
});
export type PayoutAttemptQuery = z.infer<typeof payoutAttemptQuerySchema>;

/** `payout_run_start` raises this when another run has not finished. */
const RUN_IN_PROGRESS = 'SGB11';

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
