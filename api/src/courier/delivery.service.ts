import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import type { ReportCourierIssueInput } from '../admin/dto/admin.dto.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { NotifyService } from '../notifications/notify.service.js';
import { assertTransition, type OrderStatus } from '../orders/order-status.js';
import { hydrateOrders } from '../orders/order-view.js';
import { courierEarnings, pinMatches } from './courier-pay.js';
import {
  PROOF_PHOTO_TYPES,
  type CompleteDeliveryInput,
  type LocationPingInput,
  type ProofUploadInput,
  type SignatureInput,
} from './dto/courier.dto.js';

/** Private bucket (migration 0003): only the API's service role reads or writes it. */
const DELIVERY_PROOFS_BUCKET = 'delivery-proofs';

/**
 * The two acts that move an order physically: picking it up, and handing it
 * over. Both belong to the courier carrying it, which is why they are here and
 * not on `PATCH /orders/:id/status` — each also writes a timestamp, a proof, or
 * a payout, and offering a second, evidence-free route to `delivered` would
 * make all of that optional.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loyalty: LoyaltyService,
    private readonly notify: NotifyService
  ) {}

  /** The run this courier is carrying, or a 404. Every method below starts here. */
  private async ownedRun(courierId: string, orderId: string) {
    const row = await unwrap<any | null>(
      this.db
        .from('order_deliveries')
        .select(
          `orderId:order_id, courierId:courier_id, pickedUpAt:picked_up_at,
           deliveredAt:delivered_at, distanceKm:distance_km, pin,
           orders!inner(status)`
        )
        .eq('order_id', orderId)
        .eq('courier_id', courierId)
        .maybeSingle()
    );
    // A 404 rather than a 403 — an order id you are not carrying should not be
    // confirmed to exist.
    if (!row) throw new NotFoundException('Run not found');
    const { orders: order, ...rest } = row;
    return { ...rest, status: one<any>(order)?.status as OrderStatus };
  }

  /**
   * The run as the courier's screens read it: the whole order, in the same
   * shape the shopper and the merchant get (`orders/order-view.ts`).
   *
   * ⚠️ Without the PIN (unless the courier is also the order's customer, below). This used to return `ownedRun`'s row, PIN included —
   * but the PIN is the shopper's proof that the bag reached them. A courier who
   * can read it here can close a run from anywhere; `complete` checks it against
   * what the shopper read out, which only means something if this never sends it.
   */
  async run(courierId: string, orderId: string) {
    await this.ownedRun(courierId, orderId);
    const [row, courier] = await Promise.all([
      unwrap<Record<string, unknown>>(this.db.from('orders').select('*').eq('id', orderId).single()),
      unwrap<{ user_id: string }>(this.db.from('couriers').select('user_id').eq('id', courierId).single()),
    ]);
    // The one exception: a courier carrying their *own* order — a demonstration
    // run (`DemoRunService`) — is the shopper too, and the shopper reads the code.
    const ownOrder = row.customer_id === courier.user_id;
    // The door code, unlike the PIN: getting into the building is the courier's job.
    const [order] = await hydrateOrders(this.db, [row], { revealPin: ownOrder, courierCard: false, revealDoorCode: true });
    return order;
  }

  /**
   * The courier has the bag. Paired with the `ready → out_for_delivery`
   * advance, which is checked against the same `STATUS_ACTOR` table the
   * merchant's endpoint uses — so a courier cannot pick up an order the shop
   * has not finished packing.
   */
  async markPickedUp(courierId: string, orderId: string) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.pickedUpAt) throw new ConflictException('This run is already picked up');
    assertTransition(run.status, 'out_for_delivery', 'courier');

    // Order status, pickup timestamp and history row together — see
    // `delivery_mark_picked_up`.
    await unwrapRpc<void>(
      this.db.rpc('delivery_mark_picked_up', { p_order_id: orderId, p_from: run.status }),
      (error) => {
        if (error.code === STATUS_MOVED) throw new ConflictException(error.message);
        throw unexpectedDbError(error);
      }
    );

    const [view] = await Promise.all([
      this.run(courierId, orderId),
      this.notify.orderStatusChanged(orderId, 'out_for_delivery'),
    ]);
    return view;
  }

  /**
   * Somewhere to put the photo proof.
   *
   * Same two hops as a merchant's registration documents: the API picks the
   * path and signs a one-shot upload URL, the phone sends the bytes straight to
   * Storage. The path sits under the order id, which is what `complete` checks
   * — a courier cannot close their run with a photo taken for another one.
   */
  async createProofUpload(courierId: string, orderId: string, input: ProofUploadInput) {
    await this.proofableRun(courierId, orderId);
    const path = `${orderId}/photo-${randomUUID()}.${PROOF_PHOTO_TYPES[input.contentType]}`;
    const { data, error } = await this.db.storage.from(DELIVERY_PROOFS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new InternalServerErrorException('Could not prepare the upload');
    return { path, uploadUrl: data.signedUrl, contentType: input.contentType };
  }

  /**
   * Store a drawn signature and return its path, for `complete`.
   *
   * The SVG is written here, not on the phone: the strokes are validated as
   * move/line commands and numbers (`signatureSchema`), so the file holds
   * nothing a viewer could execute — which an uploaded SVG could not promise.
   */
  async saveSignature(courierId: string, orderId: string, input: SignatureInput) {
    await this.proofableRun(courierId, orderId);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" ` +
      `viewBox="0 0 ${input.width} ${input.height}"><rect width="100%" height="100%" fill="#fff"/>` +
      input.paths
        .map(
          (d) =>
            `<path d="${d}" fill="none" stroke="#1f3d2b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
        )
        .join('') +
      '</svg>';
    const path = `${orderId}/signature-${randomUUID()}.svg`;
    const { error } = await this.db.storage
      .from(DELIVERY_PROOFS_BUCKET)
      .upload(path, Buffer.from(svg, 'utf8'), { contentType: 'image/svg+xml', upsert: false });
    if (error) throw new InternalServerErrorException('Could not store the signature');
    return { path };
  }

  /** Proof is only taken for a run that has the bag and has not been handed over. */
  private async proofableRun(courierId: string, orderId: string) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');
    if (!run.pickedUpAt) throw new ConflictException('Mark the order picked up first');
    return run;
  }

  /**
   * The image a photo or signature proof names must be this run's, and must be
   * there. Without the second half, `imagePath: "x"` closes a run with a proof
   * that is a dangling string — the dispute it exists for would open on nothing.
   */
  private async assertProofImage(orderId: string, imagePath: string) {
    if (!imagePath.startsWith(`${orderId}/`) || imagePath.includes('..')) {
      throw new BadRequestException('Preuve invalide');
    }
    // A missing object comes back as `data: false`; any other failure throws.
    let found: boolean;
    try {
      found = (await this.db.storage.from(DELIVERY_PROOFS_BUCKET).exists(imagePath)).data;
    } catch (error) {
      this.logger.error(`Proof lookup failed for ${imagePath}: ${String(error)}`);
      throw new InternalServerErrorException('Could not verify the proof');
    }
    if (!found) throw new BadRequestException("La preuve n'a pas été reçue. Réessayez.");
  }

  /**
   * The run is finished, with evidence.
   *
   * Proof and status land in one transaction on purpose: an order marked
   * delivered with no proof is exactly the state a dispute turns on, and
   * letting the two drift apart would make it reachable by closing a screen at
   * the wrong moment. The mock made the same argument and then discarded the
   * evidence anyway — `ProofCapture` admits the drawn signature "is not
   * persisted… there is no backend to upload it to". Here the path is stored.
   *
   * The PIN, when that is the method, is checked against the **stored** value
   * rather than one derived from the order id. That is the whole point of
   * Phase 5's PIN change: a derived PIN proves only that someone knows the
   * order id, which the merchant, the shopper and every URL already do.
   */
  async complete(courierId: string, orderId: string, input: CompleteDeliveryInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');
    if (!run.pickedUpAt) throw new ConflictException('Mark the order picked up first');
    assertTransition(run.status, 'delivered', 'courier');

    if (input.method === 'pin' && !pinMatches(run.pin, input.pin!)) {
      throw new BadRequestException('NIP incorrect');
    }
    if (input.method !== 'pin') await this.assertProofImage(orderId, input.imagePath!);

    const now = new Date();
    const tipCad = input.tipCad ?? 0;
    // Frozen here, once, from the distance recorded at assignment and the tip
    // as it finally landed. Never re-derived afterwards: recomputing pay from
    // today's rates would rewrite a courier's history the day a rate changes.
    const earningsCad = courierEarnings(Number(run.distanceKm), tipCad);

    // Status, timestamps, frozen pay, the proof, the history row and the
    // courier's run counter — one transaction. Proof and status must not drift
    // apart: an order marked delivered with no proof is exactly the state a
    // dispute turns on. See `delivery_complete`.
    await unwrapRpc<void>(
      this.db.rpc('delivery_complete', {
        p_order_id: orderId,
        p_courier_id: courierId,
        p_from: run.status,
        p_method: input.method,
        p_image_path: (input.imagePath ?? null) as string,
        p_note: (input.note ?? null) as string,
        p_tip_cad: tipCad,
        p_earnings_cad: earningsCad,
      }),
      (error) => {
        if (error.code === STATUS_MOVED) throw new ConflictException(error.message);
        throw unexpectedDbError(error);
      }
    );

    // **The caller Phase 4 was written for.** This is the one place an order
    // actually becomes delivered, and the brief credits points "après livraison
    // réussie" and nowhere earlier. Outside the transaction and deliberately
    // non-fatal: the delivery is a physical fact that has already happened, and
    // a ledger hiccup must not un-deliver it. `creditForDeliveredOrder` is
    // idempotent, so a retry — or Phase 6's backfill — settles it.
    try {
      await this.loyalty.creditForDeliveredOrder(orderId, now);
    } catch (error) {
      this.logger.error(`Order ${orderId} delivered but loyalty credit failed — needs a replay: ${String(error)}`);
    }

    const [view] = await Promise.all([this.run(courierId, orderId), this.notify.orderStatusChanged(orderId, 'delivered')]);
    return view;
  }

  /**
   * The courier flags a problem — nobody at the door, a wrong address, a shop
   * that is not ready.
   *
   * Changes nothing else, deliberately: the run stays open, because a courier
   * standing outside a locked building still has someone's dinner and the order
   * is not resolved until it is somewhere. Port of the mock's
   * `reportCourierIssue`, with the status field the mock's `CourierIssue`
   * never had — nothing there could ever close one.
   *
   * One report per order: reopening would overwrite what the courier first
   * said, which is the part an administrator is reading.
   */
  async reportIssue(courierId: string, orderId: string, input: ReportCourierIssueInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');

    // One report per order: reopening would overwrite what the courier first
    // said, which is the part an administrator is reading. The unique violation
    // is what says so.
    const { data, error } = await this.db
      .from('courier_issues')
      .insert({ order_id: orderId, reason: input.reason, message: input.message, status: 'open' })
      .select('*')
      .maybeSingle();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ConflictException('An issue is already open on this run');
      throw unexpectedDbError(error);
    }

    this.logger.warn(`Courier ${courierId} reported "${input.reason}" on order ${orderId}`);
    return camelize(data);
  }

  /**
   * A GPS ping while carrying an order.
   *
   * Append-only rather than an upsert-in-place: the write volume is one row
   * every few seconds per active run, and keeping the trail makes a disputed
   * delivery answerable ("the courier was two streets away at 19:04") in a way
   * a single overwritten position never could.
   *
   * Only accepted while the run is actually in flight — a courier's app that
   * keeps pinging after delivery, or before pickup, is reporting a position
   * nobody is waiting on.
   */
  async recordLocation(courierId: string, orderId: string, input: LocationPingInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');

    // The ping and the heartbeat it implies, together — a courier mid-run is
    // plainly on shift, and requiring a separate keep-alive would age them out
    // of the roster while they are literally driving.
    const recordedAt = await unwrapRpc<string>(
      this.db.rpc('courier_record_location', {
        p_courier_id: courierId,
        p_order_id: orderId,
        p_lat: input.lat,
        p_lng: input.lng,
        p_heading: input.heading,
      })
    );

    return { recordedAt };
  }
}

/** `delivery_mark_picked_up` / `delivery_complete` raise this when the order moved under the courier. */
const STATUS_MOVED = 'SGB04';
/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
