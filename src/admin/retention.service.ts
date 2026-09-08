import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';

export type PurgeReport = {
  courierLocations: number;
  deliveryProofs: number;
  /** Proofs old enough to purge but held back — see `skippedReason`. */
  deliveryProofsHeld: number;
  skippedReason?: string;
};

/**
 * Deleting what we said we would delete.
 *
 * The privacy policy commits to retention periods, and a stated period that no
 * code enforces is not a retention policy — it is a claim. This is the code.
 *
 * Both periods are read from `platform_settings` on every run rather than
 * baked in, so the number in the policy and the number the purge uses cannot
 * drift apart, and changing one is an audited admin action.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: ConfigService<Env, true>
  ) {}

  async purge(): Promise<PurgeReport> {
    const settings = await unwrap<{ locationDays: number; proofDays: number } | null>(
      this.db
        .from('platform_settings')
        .select('locationDays:courier_location_retention_days, proofDays:delivery_proof_retention_days')
        .eq('id', 1)
        .maybeSingle()
    );

    // No settings row means no stated retention period, which means nothing has
    // been promised and nothing should be destroyed on a guess.
    if (!settings) {
      this.logger.warn('No platform_settings row — skipping the retention purge rather than guessing a period');
      return { courierLocations: 0, deliveryProofs: 0, deliveryProofsHeld: 0, skippedReason: 'no settings row' };
    }

    return {
      courierLocations: await this.purgeCourierLocations(settings.locationDays),
      ...(await this.purgeDeliveryProofs(settings.proofDays)),
    };
  }

  /**
   * The GPS trail. A plain delete: nothing downstream reads a ping older than
   * the live map, and the distance that sets a courier's pay was frozen onto
   * `order_deliveries` at delivery rather than re-derived from these rows.
   */
  private async purgeCourierLocations(days: number): Promise<number> {
    // The cutoff is computed by the database, not this process: a purge that
    // deletes on a drifting host clock deletes the wrong rows.
    const count = await unwrapRpc<number>(this.db.rpc('retention_purge_locations', { p_days: days }));

    if (count > 0) {
      this.logger.log(`Retention: deleted ${count} courier location ping(s) older than ${days} days`);
    }
    return count;
  }

  /**
   * Signatures and delivery photos.
   *
   * Two things make this harder than the GPS trail, and both are the kind of
   * detail that turns a purge into a liability:
   *
   * **The row is not the data.** `image_path` points into the private
   * `delivery-proofs` Storage bucket; the bytes live there. Deleting the row
   * without deleting the object destroys the *index* to a photograph of
   * somebody's front door while leaving the photograph itself in the bucket
   * forever — strictly worse than not purging, because now nothing even knows
   * it is there. So a proof carrying an `image_path` is only deleted once the
   * object is gone, and if Storage cannot be reached the row stays.
   *
   * **An unresolved dispute outranks the clock.** A proof is the evidence for
   * "it never arrived". Destroying it while that argument is live would leave
   * the platform ruling on a dispute having deleted the only thing that answers
   * it. Held indefinitely until the dispute is settled, then subject to the
   * ordinary period.
   */
  private async purgeDeliveryProofs(
    days: number
  ): Promise<{ deliveryProofs: number; deliveryProofsHeld: number; skippedReason?: string }> {
    // Anything with an image can only go once Storage can go with it.
    const withImage = await unwrap<{ order_id: string; image_path: string }[]>(
      this.db.rpc('retention_expired_proofs_with_image', { p_days: days })
    );

    if (withImage.length > 0 && !this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true })) {
      // Loud, and it does not proceed. Deleting these rows now would orphan the
      // images rather than remove them.
      this.logger.warn(
        `Retention: ${withImage.length} delivery proof(s) are past their ${days}-day period but carry a Storage ` +
          'image, and SUPABASE_SERVICE_ROLE_KEY is not set — the objects cannot be deleted, so the rows are kept. ' +
          'Set the key to complete the purge; deleting the rows alone would leave the images in the bucket with ' +
          'nothing pointing at them.'
      );
    }

    // Proofs with no image — a plain "left at the door" note, or a signature
    // method that never produced a file — have nothing in Storage to wait for.
    const deleted = await unwrapRpc<number>(
      this.db.rpc('retention_delete_proofs_without_image', { p_days: days })
    );

    if (deleted > 0) {
      this.logger.log(`Retention: deleted ${deleted} delivery proof(s) older than ${days} days`);
    }

    return {
      deliveryProofs: deleted,
      deliveryProofsHeld: withImage.length,
      ...(withImage.length > 0 ? { skippedReason: 'SUPABASE_SERVICE_ROLE_KEY not set; Storage objects cannot be deleted' } : {}),
    };
  }
}


