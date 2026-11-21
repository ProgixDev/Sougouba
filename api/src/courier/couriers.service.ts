import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Env } from '../config/env.js';

import type { Db } from '../db/client.js';
import { camelize, snakeize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { hydrateOrders } from '../orders/order-view.js';
import { GeoService } from '../geo/geo.service.js';
import type { ApplyCourierInput, SetShiftInput, UpdateCourierInput } from './dto/courier.dto.js';

/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

/**
 * PostgREST reports the constraint in `message`/`details` rather than in a
 * `constraint_name` field the way postgres.js did.
 */
function isUniqueViolation(error: PostgrestError | null, constraint: string): boolean {
  if (!error || error.code !== UNIQUE_VIOLATION) return false;
  return `${error.message} ${error.details ?? ''}`.includes(constraint);
}

/** Same reading as `config/runtime.ts`: '0', 'false' and empty all mean off. */
function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

@Injectable()
export class CouriersService {
  private readonly logger = new Logger(CouriersService.name);
  private readonly demoSelfApproval: boolean;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly geo: GeoService,
    config: ConfigService<Env, true>
  ) {
    this.demoSelfApproval = truthy(config.get('ALLOW_DEMO_SELF_APPROVAL', { infer: true }));
    if (this.demoSelfApproval) {
      this.logger.error(
        'ALLOW_DEMO_SELF_APPROVAL is set: any pending courier can approve their own file. Unset it before delivery.'
      );
    }
  }

  /**
   * A courier registers.
   *
   * Created `pending` and offered nothing until an administrator clears the
   * file — same gate the CDC puts in front of a shop, and for the same reason:
   * this person will be handed a stranger's dinner and their home address.
   *
   * `rating` and `deliveryCount` start at zero rather than at a flattering
   * default, matching the merchant rule.
   */
  async apply(userId: string, input: ApplyCourierInput) {
    const existing = await unwrap<{ id: string } | null>(
      this.db.from('couriers').select('id').eq('user_id', userId).maybeSingle()
    );
    if (existing) throw new ConflictException('This account already has a courier file');

    // The base is the courier's declared home area — the origin a dispatch
    // offer is ranked from until they go on shift and send a real position.
    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);

    // Courier row, insurance if motorised, and the profile pointer, together.
    // A courier file with no insurance row is one a reviewer would reject for
    // paperwork the applicant actually submitted.
    const courierId = await unwrapRpc<string>(
      this.db.rpc('courier_apply', {
        p_user_id: userId,
        p_full_name: input.fullName,
        p_phone: input.phone,
        p_vehicle: input.vehicle,
        p_plate: (input.plate ?? null) as string,
        p_licence_number: (input.licenceNumber ?? null) as string,
        p_city: input.city,
        p_postal_code: input.postalCode,
        p_base_lat: lat,
        p_base_lng: lng,
        p_insurer_name: input.insurerName,
        p_policy_number: input.insurancePolicy,
        p_insurance_expiry: input.insuranceExpiry,
      }),
      (error) => {
        // The pre-check above is a friendly fast path, not the guarantee — two
        // taps a moment apart both pass it. `couriers_user_id_unique` is what
        // holds the rule.
        if (isUniqueViolation(error, 'couriers_user_id_unique')) {
          throw new ConflictException('This account already has a courier file');
        }
        throw unexpectedDbError(error);
      }
    );

    return this.byId(courierId);
  }

  /**
   * Test phase only: a pending courier clears their own file, so the gate's
   * "Simuler l'approbation" button can open the driver screens.
   *
   * Off unless `ALLOW_DEMO_SELF_APPROVAL` is set, and then a 404 — the route
   * should look absent, not forbidden. Only `pending` moves: a rejected or
   * suspended file stays where an administrator put it. No audit row and no
   * push, because no administrator decided anything.
   */
  async demoApprove(userId: string) {
    if (!this.demoSelfApproval) throw new NotFoundException();
    const courierId = await this.courierIdFor(userId);
    await unwrap(
      this.db
        .from('couriers')
        .update({ status: 'approved', status_reason: null, reviewed_at: new Date().toISOString() })
        .eq('id', courierId)
        .eq('status', 'pending')
    );
    this.logger.warn(`Courier ${courierId} approved their own file (ALLOW_DEMO_SELF_APPROVAL)`);
    return this.byId(courierId);
  }

  /** The courier's own file, at any status — how a pending applicant watches their queue position. */
  async mine(userId: string) {
    const row = await unwrap<{ id: string } | null>(
      this.db.from('couriers').select('id').eq('user_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no courier file');
    return this.byId(row.id);
  }

  private async byId(courierId: string) {
    const courier = await unwrap<Record<string, unknown> | null>(
      this.db.from('couriers').select('*').eq('id', courierId).maybeSingle()
    );
    if (!courier) throw new NotFoundException('Courier not found');

    const insurance = await unwrap<Record<string, unknown> | null>(
      this.db.from('courier_insurance').select('*').eq('courier_id', courierId).maybeSingle()
    );

    return {
      ...camelize<Record<string, unknown>>(courier),
      rating: Number(courier.rating),
      insurance: insurance ? camelize(insurance) : null,
    };
  }

  /** The id behind the token, and the ownership check every courier route reuses. */
  async courierIdFor(userId: string): Promise<string> {
    const row = await unwrap<{ id: string } | null>(
      this.db.from('couriers').select('id').eq('user_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no courier file');
    return row.id;
  }

  async update(userId: string, patch: UpdateCourierInput) {
    const courierId = await this.courierIdFor(userId);
    // Cast: `snakeize` returns an open record, and the generated Update type
    // is a closed set of columns. The patch is already validated by
    // `UpdateCourierInput`, which is the narrower guarantee of the two.
    await unwrap(this.db.from('couriers').update(snakeize(patch) as never).eq('id', courierId));
    return this.byId(courierId);
  }

  /**
   * Going on or off shift.
   *
   * Going online writes the courier's current position over their base, because
   * that is what the dispatcher ranks from — a courier standing downtown should
   * be offered downtown runs, not runs near where they registered.
   *
   * Only an **approved** courier can go online. A pending or suspended file
   * flipping the switch would put someone the platform has not cleared into the
   * dispatch pool.
   */
  async setShift(userId: string, input: SetShiftInput) {
    const courierId = await this.courierIdFor(userId);
    const courier = await unwrap<{ status: string }>(
      this.db.from('couriers').select('status').eq('id', courierId).single()
    );

    if (input.isOnline && courier.status !== 'approved') {
      throw new ConflictException(
        courier.status === 'pending'
          ? 'Votre dossier est encore en cours de validation'
          : 'Votre compte livreur est suspendu'
      );
    }

    await unwrap(
      this.db
        .from('couriers')
        .update({
          is_online: input.isOnline,
          last_seen_at: new Date().toISOString(),
          ...(input.isOnline && input.lat !== undefined && input.lng !== undefined
            ? { base_lat: input.lat, base_lng: input.lng }
            : {}),
        })
        .eq('id', courierId)
    );

    return this.byId(courierId);
  }

  /**
   * Keep-alive. Separate from a location ping because a courier waiting for
   * work is not carrying an order and has no `courier_locations` row to write —
   * without this, an idle courier would age out of the roster in two minutes
   * and stop being offered anything.
   */
  async heartbeat(userId: string, position?: { lat: number; lng: number }) {
    const courierId = await this.courierIdFor(userId);
    await unwrap(
      this.db
        .from('couriers')
        .update({
          last_seen_at: new Date().toISOString(),
          ...(position ? { base_lat: position.lat, base_lng: position.lng } : {}),
        })
        .eq('id', courierId)
    );
    return { ok: true as const };
  }

  /**
   * A courier's finished runs, newest first — the SQL port of the client-side
   * reduce in `lib/courierAnalytics.ts`'s `summariseRuns`.
   *
   * Every figure comes from `order_deliveries.earnings_cad`, **frozen when the
   * run completed**, never re-derived from today's rates. Re-deriving would
   * silently rewrite a courier's history the day a rate changes, which is the
   * one thing an earnings screen must never do.
   */
  async earnings(userId: string, days: number) {
    const courierId = await this.courierIdFor(userId);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    // One call. The day buckets are grouped in Montreal time, which is the
    // part that cannot move client-side: a run delivered at 20:00 Montreal is
    // 00:00 UTC the next day, and bucketing in UTC would shift a courier's
    // whole evening onto tomorrow's bar. See `courier_earnings`.
    const totals = await unwrap<{
      earningsCad: number;
      tipsCad: number;
      distanceKm: number;
      runCount: number;
      buckets: { date: string; earningsCad: number; distanceKm: number; runCount: number }[];
    }>(this.db.rpc('courier_earnings', { p_courier_id: courierId, p_since: since.toISOString() }));

    const runCount = totals.runCount ?? 0;
    const earningsCad = totals.earningsCad ?? 0;

    return {
      days,
      earningsCad,
      tipsCad: totals.tipsCad ?? 0,
      distanceKm: totals.distanceKm ?? 0,
      runCount,
      avgPerRunCad: runCount > 0 ? Math.round((earningsCad / runCount) * 100) / 100 : 0,
      // Empty days are filled in by the client, which knows the window it asked
      // for. Emitting them here would mean generating a date series in SQL to
      // ship rows that are all zero.
      buckets: totals.buckets ?? [],
    };
  }

  /**
   * Everything this courier has carried, newest first — as whole orders, in the
   * shape every other order endpoint answers with (`orders/order-view.ts`), PIN
   * withheld. This used to be a hand-picked join keyed `orderId` with the run's
   * money at the top level; the app reads `order.id` and `order.delivery`, so
   * history listed nothing and earnings summed to zero.
   */
  async runs(userId: string, query: { limit: number; offset: number; paged?: boolean; deliveredOnly?: boolean }) {
    const { limit, offset } = query;
    const courierId = await this.courierIdFor(userId);
    let q = this.db.from('order_deliveries').select('order_id', { count: 'exact' }).eq('courier_id', courierId);
    if (query.deliveredOnly) q = q.not('delivered_at', 'is', null);
    const { data, count, error } = await q
      .order('accepted_at', { ascending: false })
      // Two runs accepted in the same instant would otherwise swap between
      // requests, and a page boundary would repeat one and drop the other.
      .order('order_id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException('Database request failed');
    const runs = data ?? [];

    let items: Awaited<ReturnType<typeof hydrateOrders>> = [];
    if (runs.length > 0) {
      const ids = runs.map((r) => r.order_id);
      const rows = await unwrap<Record<string, unknown>[]>(this.db.from('orders').select('*').in('id', ids));
      const byId = new Map((await hydrateOrders(this.db, rows, { revealPin: false, courierCard: false })).map((o) => [o.id, o]));
      // `in` does not keep order; the run list's does.
      items = ids.map((id) => byId.get(id)).filter((o) => o !== undefined);
    }
    // The bare array is what builds already installed expect; `paged` opts in.
    return query.paged ? { items, total: count ?? 0, limit, offset } : items;
  }

  /**
   * The live position for one order's tracking map — the latest ping only.
   *
   * Replaces `lib/courierRoute.ts`'s simulation, which computed a position as a
   * pure function of elapsed time along a generated zig-zag. Nothing here is
   * derived: if the courier's app has not pinged, there is no position, and the
   * map says so rather than animating a courier who may not be moving.
   */
  async latestLocationForOrder(orderId: string) {
    const ping = await unwrap<{ lat: number; lng: number; heading: number | null; recordedAt: string } | null>(
      this.db
        .from('courier_locations')
        .select('lat, lng, heading, recordedAt:recorded_at')
        .eq('order_id', orderId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    return ping ?? null;
  }
}

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
